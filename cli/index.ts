import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { parseAccountsCli } from "../platforms/mail/accounts"
import { parseAuthCli } from "../platforms/mail/auth"
import { parseMailCli } from "../platforms/mail/mail"
import { parseMonitorCli } from "../platforms/mail/monitor"
import { parsePollCli } from "../platforms/mail/poll"
import { parseSlackCli } from "../platforms/slack"
import { parseTeamsCli } from "../platforms/teams"
import { parseWhatsAppCli } from "../platforms/whatsapp"
import { verboseLog } from "../src/Verbose"

let args = hideBin(process.argv)
let subcommands = new Set(["mail", "slack", "teams", "whatsapp", "help"])
let verbose = args.includes("--verbose") || args.includes("-v")
let commandIndex = args.findIndex(x => !x.startsWith("-"))
let command = commandIndex >= 0 ? args[commandIndex] : undefined
let commandArgs = commandIndex >= 0 ? args.slice(commandIndex + 1) : []
let forwardedVerboseArgs = verbose ? ["--verbose"] : []
let dispatched = false

let cli = yargs(args)
  .scriptName("messagemon")
  .usage("Usage: $0 <platform> <command> [options]")
  .option("verbose", {
    alias: "v",
    type: "boolean",
    default: false,
    describe: "Print diagnostic details to stderr",
  })
  .command("mail", "Gmail: search, read, send, export, monitor email messages")
  .command("slack", "Slack: search, read, send, poll, monitor Slack messages")
  .command("teams", "Teams: search, read, send, poll, monitor Microsoft Teams messages")
  .command("whatsapp", "WhatsApp: read, send, poll, monitor WhatsApp messages")
  .command(
    "help [platform] [command]",
    "Show main help or help for a specific platform/command",
    y =>
      y
        .positional("platform", {
          type: "string",
          choices: ["mail", "slack", "teams", "whatsapp"] as const,
          describe: "Platform to show help for",
        })
        .positional("command", {
          type: "string",
          describe: "Subcommand to show help for",
        }),
    async argv => {
      if (!argv.platform) {
        cli.showHelp()
        return
      }
      let helpArgs = argv.command ? [argv.command, "--help"] : ["--help"]
      if (argv.platform === "mail") return parseMailCli(helpArgs, "messagemon mail")
      if (argv.platform === "slack") return parseSlackCli(helpArgs, "messagemon slack")
      if (argv.platform === "teams") return parseTeamsCli(helpArgs, "messagemon teams")
      if (argv.platform === "whatsapp") return parseWhatsAppCli(helpArgs, "messagemon whatsapp")
    },
  )
  .example("$0 help", "Show top-level help")
  .example("$0 help mail", "Show help for mail subcommands and options")
  .example("$0 mail search \"from:someone newer_than:7d\"", "Search Gmail messages")
  .example("$0 mail send --to you@example.com --subject \"Hi\" --body \"Hello\" --yes", "Send an email")
  .example("$0 mail auth --account=personal", "Authorize a Gmail account")
  .example("$0 mail monitor --query='in:inbox is:unread' --agent-cmd='...'", "Monitor Gmail and run agents")
  .example("$0 slack search \"project update\"", "Search Slack messages (planned)")
  .example("$0 teams search \"quarterly review\"", "Search Teams messages (planned)")
  .example("$0 whatsapp send --to +1234567890 --body \"Hello\"", "Send a WhatsApp message (planned)")
  .epilog(
    [
      "Platforms:",
      "  mail      — Gmail via Google APIs (fully implemented)",
      "  slack     — Slack via @slack/web-api (planned)",
      "  teams     — Microsoft Teams via Graph API (planned)",
      "  whatsapp  — WhatsApp via Cloud API (planned)",
      "",
      "Each platform stores credentials and tokens under .messagemon/<platform>/.",
      "Use `messagemon <platform> auth` to set up credentials for a platform.",
      "Use `--verbose` at any level for stderr diagnostics.",
    ].join("\n"),
  )
  .strict()
  .demandCommand(1)
  .recommendCommands()
  .help()
  .alias("help", "h")

if (args.length === 0) {
  cli.showHelp()
  process.exit(0)
}

if (verbose) {
  verboseLog(true, "dispatch args", { args })
}

if (args.includes("--help") || args.includes("-h")) {
  if (!command) {
    cli.showHelp()
    process.exit(0)
  }
}

if (command == null) {
  if (args.includes("--version")) {
    dispatched = true
    cli.parseAsync().catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  } else {
    cli.showHelp()
    process.exit(0)
  }
}

if (!dispatched && (args[0] === "--help" || args[0] === "-h")) {
  cli.showHelp()
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Mail platform — dispatches to sub-parsers for mail-specific commands
// ---------------------------------------------------------------------------

if (!dispatched && command === "mail") {
  // The first arg after "mail" may be a mail subcommand or a mail-level flag.
  // Legacy top-level commands (auth, accounts, poll, monitor) are now nested
  // under "mail" as well.
  let mailSubcommand = commandArgs.find(x => !x.startsWith("-"))

  if (mailSubcommand === "auth") {
    let authArgs = commandArgs.filter(x => x !== "auth")
    parseAuthCli([...forwardedVerboseArgs, ...authArgs], "messagemon mail auth").catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  } else if (mailSubcommand === "accounts") {
    let accountsArgs = commandArgs.filter(x => x !== "accounts")
    parseAccountsCli([...forwardedVerboseArgs, ...accountsArgs], "messagemon mail accounts").catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  } else if (mailSubcommand === "poll") {
    let pollArgs = commandArgs.filter(x => x !== "poll")
    parsePollCli([...forwardedVerboseArgs, ...pollArgs], "messagemon mail poll").catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  } else if (mailSubcommand === "monitor") {
    let monitorArgs = commandArgs.filter(x => x !== "monitor")
    parseMonitorCli([...forwardedVerboseArgs, ...monitorArgs], "messagemon mail monitor").catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  } else {
    parseMailCli([...forwardedVerboseArgs, ...commandArgs], "messagemon mail").catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  }
}

// ---------------------------------------------------------------------------
// Slack platform
// ---------------------------------------------------------------------------

else if (!dispatched && command === "slack") {
  parseSlackCli([...forwardedVerboseArgs, ...commandArgs], "messagemon slack").catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })
}

// ---------------------------------------------------------------------------
// Teams platform
// ---------------------------------------------------------------------------

else if (!dispatched && command === "teams") {
  parseTeamsCli([...forwardedVerboseArgs, ...commandArgs], "messagemon teams").catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })
}

// ---------------------------------------------------------------------------
// WhatsApp platform
// ---------------------------------------------------------------------------

else if (!dispatched && command === "whatsapp") {
  parseWhatsAppCli([...forwardedVerboseArgs, ...commandArgs], "messagemon whatsapp").catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

else if (!dispatched && command === "help") {
  if (args.length === 1) {
    cli.showHelp()
    process.exit(0)
  }
  let subhelp = commandArgs[0]
  if (subhelp === "mail") {
    parseMailCli([...forwardedVerboseArgs, "--help"], "messagemon mail")
  } else if (subhelp === "slack") {
    parseSlackCli([...forwardedVerboseArgs, "--help"], "messagemon slack")
  } else if (subhelp === "teams") {
    parseTeamsCli([...forwardedVerboseArgs, "--help"], "messagemon teams")
  } else if (subhelp === "whatsapp") {
    parseWhatsAppCli([...forwardedVerboseArgs, "--help"], "messagemon whatsapp")
  } else {
    cli.parseAsync().catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  }
}

// ---------------------------------------------------------------------------
// Unknown command — let yargs handle the error
// ---------------------------------------------------------------------------

else if (!dispatched) {
  if (!command || !subcommands.has(command)) {
    cli.parseAsync().catch(e => {
      console.error(e?.message ?? e)
      process.exit(1)
    })
  }
}
