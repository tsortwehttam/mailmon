import fs from "node:fs"
import http from "node:http"
import crypto from "node:crypto"
import { exec } from "node:child_process"
import { URL } from "node:url"
import path from "node:path"
import { fileURLToPath } from "node:url"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { WebClient } from "@slack/web-api"
import type { Argv } from "yargs"
import {
  DEFAULT_ACCOUNT,
  resolveCredentialsPath,
  resolveTokenWriteDir,
  resolveTokenWritePathForAccount,
} from "../../src/CliConfig"
import { verboseLog } from "../../src/Verbose"
import type { SlackTokenFile } from "./slackClient"

// ---------------------------------------------------------------------------
// Bot-token mode: user pastes a token string
// ---------------------------------------------------------------------------

let authBot = async (account: string, token: string, verbose = false) => {
  let client = new WebClient(token)
  let test = await client.auth.test()
  if (!test.ok) throw new Error(`auth.test failed: ${test.error}`)

  let tokenFile: SlackTokenFile = {
    bot_token: token,
    team_id: test.team_id,
    team_name: test.team,
  }

  let tokenDir = resolveTokenWriteDir("slack")
  let tokenPath = resolveTokenWritePathForAccount(account, "slack")
  fs.mkdirSync(tokenDir, { recursive: true })
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2) + "\n")

  verboseLog(verbose, "saved token", { account, tokenPath, teamId: test.team_id })
  console.log(`Authenticated as "${test.user}" in workspace "${test.team}" (${test.team_id})`)
  console.log(`Saved ${tokenPath}`)
}

// ---------------------------------------------------------------------------
// OAuth mode: browser-based install flow
// ---------------------------------------------------------------------------

let SLACK_OAUTH_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
let OAUTH_PORTS = [9876, 9877, 9878, 9879, 9880]

export let BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "mpim:history",
  "users:read",
  "chat:write",
].join(",")

export let USER_SCOPES = [
  "search:read",
  "chat:write",
].join(",")

let tryListen = (server: http.Server, ports: number[]): Promise<number> =>
  new Promise((resolve, reject) => {
    let attempt = (i: number) => {
      if (i >= ports.length) {
        reject(new Error(
          `Could not start local server — ports ${ports[0]}-${ports[ports.length - 1]} are in use.\n` +
          `Check what's using them with: lsof -i :${ports[0]}`
        ))
        return
      }
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") attempt(i + 1)
        else reject(err)
      })
      server.listen(ports[i], "localhost", () => resolve(ports[i]))
    }
    attempt(0)
  })

let openBrowser = (url: string) => {
  let cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open"
  exec(`${cmd} ${JSON.stringify(url)}`, () => {})
}

let authOAuth = async (account: string, verbose = false) => {
  let credentialsPath = resolveCredentialsPath("slack")
  verboseLog(verbose, "reading credentials", { credentialsPath })

  let creds = JSON.parse(fs.readFileSync(credentialsPath, "utf8"))
  let clientId = creds.client_id
  let clientSecret = creds.client_secret
  if (!clientId || !clientSecret) {
    throw new Error(
      `${credentialsPath} must contain "client_id" and "client_secret".\n` +
      `Expected format: { "client_id": "...", "client_secret": "..." }\n` +
      `Find these under "Basic Information" in your Slack app settings.`
    )
  }

  let state = crypto.randomBytes(16).toString("hex")

  // Start a local HTTP server to receive the OAuth callback
  let server = http.createServer()
  let port = await tryListen(server, OAUTH_PORTS)
  let redirectUri = `http://localhost:${port}`

  let { code, receivedState } = await new Promise<{ code: string; receivedState: string }>((resolve, reject) => {
    server.on("request", (req, res) => {
      let url = new URL(req.url!, `http://localhost`)
      let code = url.searchParams.get("code")
      let receivedState = url.searchParams.get("state")
      let error = url.searchParams.get("error")

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" })
        res.end(`<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`)
        server.close()
        reject(new Error(`Slack OAuth error: ${error}`))
        return
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" })
        res.end(`<h1>Missing code</h1><p>You can close this tab.</p>`)
        return
      }

      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<h1>Authorized!</h1><p>You can close this tab and return to the terminal.</p>`)
      server.close()
      resolve({ code, receivedState: receivedState ?? "" })
    })

    let authUrl =
      `${SLACK_OAUTH_AUTHORIZE_URL}?client_id=${clientId}&scope=${BOT_SCOPES}` +
      `&user_scope=${USER_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`

    openBrowser(authUrl)
    console.log(`Opening browser... if it didn't open, visit:`)
    console.log(authUrl)
    console.log("Waiting for callback...")

    setTimeout(() => {
      server.close()
      reject(new Error("OAuth callback timed out after 5 minutes"))
    }, 5 * 60 * 1000)
  })

  if (receivedState !== state) {
    throw new Error("OAuth state mismatch — possible CSRF attack")
  }

  // Exchange code for tokens
  let client = new WebClient()
  let oauthResponse = await client.oauth.v2.access({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  })

  if (!oauthResponse.ok) {
    throw new Error(`oauth.v2.access failed: ${oauthResponse.error}`)
  }

  let botToken = oauthResponse.access_token
  let userToken = (oauthResponse.authed_user as { access_token?: string } | undefined)?.access_token
  let teamId = (oauthResponse.team as { id?: string } | undefined)?.id
  let teamName = (oauthResponse.team as { name?: string } | undefined)?.name

  if (!botToken) throw new Error("No bot token received from OAuth exchange")

  let tokenFile: SlackTokenFile = {
    bot_token: botToken,
    user_token: userToken,
    team_id: teamId,
    team_name: teamName,
  }

  let tokenDir = resolveTokenWriteDir("slack")
  let tokenPath = resolveTokenWritePathForAccount(account, "slack")
  fs.mkdirSync(tokenDir, { recursive: true })
  fs.writeFileSync(tokenPath, JSON.stringify(tokenFile, null, 2) + "\n")

  verboseLog(verbose, "saved OAuth tokens", {
    account,
    tokenPath,
    teamId,
    hasUserToken: !!userToken,
  })
  console.log(`Authenticated workspace "${teamName}" (${teamId})`)
  console.log(`Bot token: yes | User token: ${userToken ? "yes" : "no"}`)
  console.log(`Saved ${tokenPath}`)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export let configureAuthCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 [options]")
    .option("account", {
      type: "string",
      default: DEFAULT_ACCOUNT,
      describe: "Account name (writes .msgmon/slack/tokens/<account>.json)",
    })
    .option("mode", {
      type: "string",
      choices: ["bot", "oauth"] as const,
      default: "bot",
      describe: "Auth mode: bot (paste token) or oauth (browser flow)",
    })
    .option("token", {
      type: "string",
      describe: "Bot token string (for --mode=bot; reads from stdin if omitted)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .example("$0 --token=xoxb-...", "Save a bot token for the default account")
    .example("$0 --mode=oauth --account=myworkspace", "Run OAuth install flow")
    .strict()
    .help()

export let parseAuthCli = async (args: string[], scriptName = "slack auth") => {
  let argv = await configureAuthCli(yargs(args).scriptName(scriptName)).parseAsync()

  if (argv.mode === "oauth") {
    await authOAuth(argv.account, argv.verbose)
  } else {
    let token = argv.token
    if (!token) {
      // Read from stdin
      let chunks: Buffer[] = []
      for await (let chunk of process.stdin) chunks.push(chunk as Buffer)
      token = Buffer.concat(chunks).toString("utf8").trim()
    }
    if (!token) throw new Error("No token provided. Pass --token or pipe to stdin.")
    await authBot(argv.account, token, argv.verbose)
  }
}

export let runAuthCli = (args = hideBin(process.argv), scriptName = "slack auth") =>
  parseAuthCli(args, scriptName).catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runAuthCli()
}
