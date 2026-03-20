import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { TOKEN_FILE_EXTENSION, resolveAllTokenDirs } from "../../src/CliConfig"
import type { Argv } from "yargs"
import { verboseLog } from "../../src/Verbose"
import type { SlackTokenFile } from "./slackClient"

type SlackAccountInfo = {
  account: string
  team_id?: string
  team_name?: string
  has_bot_token: boolean
  has_user_token: boolean
}

let listAccounts = (): { accounts: SlackAccountInfo[]; dirs: string[] } => {
  let seen = new Map<string, SlackAccountInfo>()
  let dirs = resolveAllTokenDirs("slack")
  for (let dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(TOKEN_FILE_EXTENSION)) continue
      let account = path.basename(entry.name, TOKEN_FILE_EXTENSION)
      if (seen.has(account)) continue
      let info: SlackAccountInfo = { account, has_bot_token: false, has_user_token: false }
      try {
        let raw: SlackTokenFile = JSON.parse(fs.readFileSync(path.join(dir, entry.name), "utf8"))
        info.team_id = raw.team_id
        info.team_name = raw.team_name
        info.has_bot_token = !!raw.bot_token
        info.has_user_token = !!raw.user_token
      } catch { /* token file may be corrupt — still list it */ }
      seen.set(account, info)
    }
  }
  return {
    accounts: Array.from(seen.values()).sort((a, b) => a.account.localeCompare(b.account)),
    dirs,
  }
}

export let configureAccountsCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 [options]")
    .option("format", {
      type: "string",
      choices: ["json", "text"] as const,
      default: "json",
      describe: "Output format",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .example("$0 --format=json", "Print Slack accounts as JSON")
    .example("$0 --format=text", "Print one account per line")
    .strict()
    .help()

export let parseAccountsCli = (args: string[], scriptName = "slack accounts") =>
  configureAccountsCli(yargs(args).scriptName(scriptName))
    .parseAsync()
    .then(argv => {
      let { accounts, dirs } = listAccounts()
      verboseLog(argv.verbose, "scanned token directories", dirs)
      verboseLog(argv.verbose, "slack accounts found", { count: accounts.length })
      if (argv.format === "text") {
        for (let a of accounts) {
          let label = a.team_name ? `${a.account} (${a.team_name})` : a.account
          console.log(label)
        }
        return
      }
      console.log(JSON.stringify(accounts, null, 2))
    })

export let runAccountsCli = (args = hideBin(process.argv), scriptName = "slack accounts") =>
  parseAccountsCli(args, scriptName).catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runAccountsCli()
}
