import { authenticate } from "@google-cloud/local-auth"
import { google } from "googleapis"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import {
  DEFAULT_ACCOUNT,
  GMAIL_SCOPES,
  resolveCredentialsPath,
  resolveTokenWriteDir,
  resolveTokenWritePathForAccount,
} from "../../src/CliConfig"
import type { Argv } from "yargs"
import { verboseLog } from "../../src/Verbose"

let authForAccount = async (account: string | undefined, verbose = false) => {
  let credentialsPath = resolveCredentialsPath("gmail")
  let tokenDir = resolveTokenWriteDir("gmail")
  verboseLog(verbose, "auth target", { account: account ?? "(auto)", credentialsPath, tokenDir })

  fs.mkdirSync(tokenDir, { recursive: true })
  let auth = await authenticate({ keyfilePath: credentialsPath, scopes: GMAIL_SCOPES })

  // If no account name given, fetch the email address from the authorized account
  if (!account) {
    try {
      let gmail = google.gmail({ version: "v1", auth })
      let profile = await gmail.users.getProfile({ userId: "me" })
      account = profile.data.emailAddress ?? DEFAULT_ACCOUNT
    } catch {
      account = DEFAULT_ACCOUNT
    }
  }

  let tokenPath = resolveTokenWritePathForAccount(account, "gmail")
  fs.writeFileSync(tokenPath, JSON.stringify(auth.credentials, null, 2))
  console.log(`Saved ${tokenPath}`)
}

export let configureAuthCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 [options]")
    .option("account", {
      type: "string",
      describe: "Token account name (defaults to the Gmail address after auth)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .example("$0 --account=personal", "Run OAuth and save token to .msgmon/gmail/tokens/personal.json")
    .epilog(
      [
        "Output:",
        "- Prints `Saved <absolute token path>` on success.",
        "- The token file is used by `gmail` commands via the same `--account` value.",
        "- Reads credentials from `./.msgmon/gmail/credentials.json`, then `<install-dir>/.msgmon/gmail/credentials.json`, then `~/.msgmon/gmail/credentials.json`.",
        "- Writes token to `./.msgmon/gmail/tokens/` in the current working directory.",
      ].join("\n"),
    )
    .strict()
    .help()

export let parseAuthCli = (args: string[], scriptName = "auth") =>
  configureAuthCli(yargs(args).scriptName(scriptName))
    .parseAsync()
    .then(argv => authForAccount(argv.account, argv.verbose))

export let runAuthCli = (args = hideBin(process.argv), scriptName = "auth") =>
  parseAuthCli(args, scriptName).catch(e => {
    console.error(e)
    process.exit(1)
  })

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runAuthCli()
}
