/**
 * Slack platform stub.
 *
 * Credentials layout (mirrors the mail pattern):
 *   .messagemon/slack/credentials.json   — Slack app manifest (client_id, client_secret, signing_secret)
 *   .messagemon/slack/tokens/<account>.json — Bot / user OAuth tokens per workspace
 *
 * Recommended off-the-shelf packages:
 *   @slack/web-api    — Slack Web API client
 *   @slack/bolt       — Slack app framework (events, commands, shortcuts)
 *   @slack/oauth      — OAuth v2 install flow
 *
 * Planned CLI subcommands (not yet implemented):
 *   messagemon slack auth       — Run Slack OAuth install flow
 *   messagemon slack accounts   — List configured Slack workspaces
 *   messagemon slack search     — Search messages (requires search:read scope)
 *   messagemon slack read       — Read a message by channel + ts
 *   messagemon slack send       — Post a message to a channel
 *   messagemon slack poll       — Poll a channel for new messages
 *   messagemon slack monitor    — Monitor a channel and run agent per message
 */

import yargs from "yargs"
import type { Argv } from "yargs"

export let configureSlackCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 <command> [options]")
    .option("account", {
      type: "string",
      default: "default",
      describe: "Slack workspace account name (uses .messagemon/slack/tokens/<account>.json)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .command("auth", "Run Slack OAuth install flow and store token (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented. See platforms/slack/index.ts for the planned approach.")
      process.exit(1)
    })
    .command("accounts", "List configured Slack workspaces (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("search <query>", "Search Slack messages (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("read <channel> <ts>", "Read a Slack message by channel and timestamp (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("send", "Post a message to a Slack channel (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("poll", "Poll a Slack channel for new messages (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("monitor", "Monitor a Slack channel and run agent per message (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .demandCommand(1, "Choose a command: auth, accounts, search, read, send, poll, or monitor.")
    .strict()
    .help()

export let parseSlackCli = (args: string[], scriptName = "slack") =>
  configureSlackCli(yargs(args).scriptName(scriptName)).parseAsync()
