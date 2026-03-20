import fs from "node:fs"
import http from "node:http"
import crypto from "node:crypto"
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

let BOT_SCOPES = [
  "channels:history",
  "channels:read",
  "groups:history",
  "groups:read",
  "im:history",
  "mpim:history",
  "users:read",
  "chat:write",
].join(",")

let USER_SCOPES = [
  "search:read",
  "chat:write",
].join(",")

let authOAuth = async (account: string, verbose = false) => {
  let credentialsPath = resolveCredentialsPath("slack")
  verboseLog(verbose, "reading credentials", { credentialsPath })

  let creds = JSON.parse(fs.readFileSync(credentialsPath, "utf8"))
  let clientId = creds.client_id
  let clientSecret = creds.client_secret
  if (!clientId || !clientSecret) {
    throw new Error(`credentials.json must contain client_id and client_secret`)
  }

  let state = crypto.randomBytes(16).toString("hex")

  // Start a local HTTP server to receive the OAuth callback
  let { code, receivedState } = await new Promise<{ code: string; receivedState: string }>((resolve, reject) => {
    let server = http.createServer((req, res) => {
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

    server.listen(0, "127.0.0.1", () => {
      let addr = server.address()
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to start local server"))
        return
      }
      let redirectUri = `http://127.0.0.1:${addr.port}`
      let authUrl =
        `${SLACK_OAUTH_AUTHORIZE_URL}?client_id=${clientId}&scope=${BOT_SCOPES}` +
        `&user_scope=${USER_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&state=${state}`

      console.log(`\nOpen this URL in your browser to authorize:\n\n  ${authUrl}\n`)
      console.log("Waiting for callback...")
    })

    // Timeout after 5 minutes
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
  let addr = `http://127.0.0.1` // redirect_uri must match; we use the same base
  let oauthResponse = await client.oauth.v2.access({
    client_id: clientId,
    client_secret: clientSecret,
    code,
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
      describe: "Account name (writes .messagemon/slack/tokens/<account>.json)",
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
