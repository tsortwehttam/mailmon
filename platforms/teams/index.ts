/**
 * Microsoft Teams platform stub.
 *
 * Credentials layout (mirrors the mail pattern):
 *   .messagemon/teams/credentials.json   — Azure AD app registration (client_id, client_secret, tenant_id)
 *   .messagemon/teams/tokens/<account>.json — OAuth tokens per tenant/user
 *
 * Recommended off-the-shelf packages:
 *   @microsoft/microsoft-graph-client  — Microsoft Graph API client
 *   @azure/identity                    — Azure AD auth (client credentials, device code, etc.)
 *   @azure/msal-node                   — MSAL for Node.js (interactive + daemon flows)
 *
 * Planned CLI subcommands (not yet implemented):
 *   messagemon teams auth       — Run Azure AD OAuth / device-code flow
 *   messagemon teams accounts   — List configured Teams tenants
 *   messagemon teams search     — Search Teams messages via Graph API
 *   messagemon teams read       — Read a message by team/channel/message id
 *   messagemon teams send       — Post a message to a Teams channel
 *   messagemon teams poll       — Poll a channel for new messages
 *   messagemon teams monitor    — Monitor a channel and run agent per message
 */

import yargs from "yargs"
import type { Argv } from "yargs"

export let configureTeamsCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 <command> [options]")
    .option("account", {
      type: "string",
      default: "default",
      describe: "Teams tenant account name (uses .messagemon/teams/tokens/<account>.json)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .command("auth", "Run Azure AD OAuth flow and store token (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented. See platforms/teams/index.ts for the planned approach.")
      process.exit(1)
    })
    .command("accounts", "List configured Teams tenants (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("search <query>", "Search Teams messages (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("read <teamId> <channelId> <messageId>", "Read a Teams message (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("send", "Post a message to a Teams channel (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("poll", "Poll a Teams channel for new messages (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("monitor", "Monitor a Teams channel and run agent per message (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .demandCommand(1, "Choose a command: auth, accounts, search, read, send, poll, or monitor.")
    .strict()
    .help()

export let parseTeamsCli = (args: string[], scriptName = "teams") =>
  configureTeamsCli(yargs(args).scriptName(scriptName)).parseAsync()
