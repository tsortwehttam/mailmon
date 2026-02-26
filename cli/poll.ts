import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { google } from "googleapis"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { DEFAULT_ACCOUNT, resolveCredentialsPath, resolveTokenReadPathForAccount } from "../src/CliConfig"
import type { Argv } from "yargs"
import { verboseLog } from "../src/Verbose"

let loadOAuth = (account: string, verbose = false) => {
  let credentialsPath = resolveCredentialsPath()
  let tokenPath = resolveTokenReadPathForAccount(account)
  verboseLog(verbose, "poll auth", { account, credentialsPath, tokenPath })

  let raw = JSON.parse(fs.readFileSync(credentialsPath, "utf8"))
  let c = raw.installed ?? raw.web
  if (!c?.client_id || !c?.client_secret) throw new Error("Bad credentials.json (missing client_id/client_secret)")
  let o = new google.auth.OAuth2(c.client_id, c.client_secret, (c.redirect_uris ?? [])[0])
  let t = JSON.parse(fs.readFileSync(tokenPath, "utf8"))
  o.setCredentials(t)
  return o
}

let gmail = (account: string, verbose = false) => google.gmail({ version: "v1", auth: loadOAuth(account, verbose) })

let sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let pollUnread = async (params: {
  account: string
  intervalMs: number
  maxResults: number
  query: string
  out?: string
  verbose: boolean
}) => {
  while (true) {
    let response = await gmail(params.account, params.verbose).users.messages.list({
      userId: "me",
      q: params.query,
      maxResults: params.maxResults,
    })
    let messages = response.data.messages ?? []
    verboseLog(params.verbose, "poll iteration", {
      query: params.query,
      unreadCount: messages.length,
      intervalMs: params.intervalMs,
    })

    if (messages.length > 0) {
      let payload = {
        polledAt: new Date().toISOString(),
        account: params.account,
        query: params.query,
        messages,
      }
      let json = JSON.stringify(payload, null, 2)
      if (params.out) {
        let outPath = path.resolve(params.out)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, `${json}\n`)
        verboseLog(params.verbose, "wrote poll output", { outPath })
      }
      console.log(json)
      return
    }
    await sleep(params.intervalMs)
  }
}

export let configurePollCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 [options]")
    .option("account", {
      type: "string",
      default: DEFAULT_ACCOUNT,
      describe: "Token account name (uses .mailmaster/tokens/<account>.json)",
    })
    .option("interval-ms", {
      type: "number",
      default: 5000,
      coerce: value => {
        if (!Number.isFinite(value) || value <= 0) throw new Error("--interval-ms must be a positive number")
        return Math.floor(value)
      },
      describe: "Polling interval in milliseconds",
    })
    .option("max-results", {
      type: "number",
      default: 20,
      coerce: value => {
        if (!Number.isFinite(value) || value < 1 || value > 500) throw new Error("--max-results must be 1..500")
        return Math.floor(value)
      },
      describe: "Maximum matched messages to return once found",
    })
    .option("query", {
      type: "string",
      default: "is:unread",
      describe: "Gmail search query to poll for (for example: in:inbox is:unread)",
    })
    .option("out", {
      type: "string",
      describe: "Optional file path to also write matched-message JSON payload",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .example("$0 --account=personal", "Poll until query matches exist, print JSON to stdout, then exit")
    .example("$0 --query='in:inbox is:unread'", "Only poll for unread messages currently in Inbox")
    .example("$0 --query='category:promotions is:unread'", "Poll for unread Gmail promotions messages")
    .example("$0 --interval-ms=2000 --out ./tmp/unread.json", "Poll every 2s and also write JSON to a file")
    .epilog(
      [
        "Output contract:",
        "- Emits exactly one JSON object to stdout when query matches are found, then exits.",
        "- JSON payload shape: { polledAt, account, query, messages }.",
        "- Use shell pipes/redirection for downstream processing.",
        "- `--out` additionally writes the same JSON payload to a file.",
      ].join("\n"),
    )
    .strict()
    .help()

export let parsePollCli = (args: string[], scriptName = "poll") =>
  configurePollCli(yargs(args).scriptName(scriptName))
    .parseAsync()
    .then(argv =>
      pollUnread({
        account: argv.account,
        intervalMs: argv.intervalMs,
        maxResults: argv.maxResults,
        query: argv.query,
        out: argv.out,
        verbose: argv.verbose,
      }),
    )

export let runPollCli = (args = hideBin(process.argv), scriptName = "poll") =>
  parsePollCli(args, scriptName).catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runPollCli()
}
