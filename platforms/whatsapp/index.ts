/**
 * WhatsApp Business platform stub.
 *
 * Credentials layout (mirrors the mail pattern):
 *   .messagemon/whatsapp/credentials.json   — Meta app credentials (app_id, app_secret)
 *   .messagemon/whatsapp/tokens/<account>.json — Access tokens per business account / phone number
 *
 * Recommended off-the-shelf packages:
 *   whatsapp-web.js          — Unofficial WhatsApp Web client (personal accounts)
 *   whatsapp-api-js          — WhatsApp Cloud API wrapper (business accounts)
 *
 * Planned CLI subcommands (not yet implemented):
 *   messagemon whatsapp auth       — Store/verify WhatsApp Cloud API token
 *   messagemon whatsapp accounts   — List configured phone numbers / business accounts
 *   messagemon whatsapp read       — Read a message by id
 *   messagemon whatsapp send       — Send a message to a phone number
 *   messagemon whatsapp poll       — Poll for new incoming messages (webhook-based or polling)
 *   messagemon whatsapp monitor    — Monitor incoming messages and run agent per message
 */

import yargs from "yargs"
import type { Argv } from "yargs"

export let configureWhatsAppCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 <command> [options]")
    .option("account", {
      type: "string",
      default: "default",
      describe: "WhatsApp business account name (uses .messagemon/whatsapp/tokens/<account>.json)",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .command("auth", "Store/verify WhatsApp Cloud API access token (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented. See platforms/whatsapp/index.ts for the planned approach.")
      process.exit(1)
    })
    .command("accounts", "List configured WhatsApp business accounts (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("read <messageId>", "Read a WhatsApp message (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("send", "Send a WhatsApp message (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("poll", "Poll for new incoming WhatsApp messages (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .command("monitor", "Monitor incoming WhatsApp messages and run agent per message (not yet implemented)", () => {}, () => {
      console.error("Not yet implemented.")
      process.exit(1)
    })
    .demandCommand(1, "Choose a command: auth, accounts, read, send, poll, or monitor.")
    .strict()
    .help()

export let parseWhatsAppCli = (args: string[], scriptName = "whatsapp") =>
  configureWhatsAppCli(yargs(args).scriptName(scriptName)).parseAsync()
