import fs from "node:fs"
import { WebClient } from "@slack/web-api"
import { resolveTokenReadPathForAccount } from "../../src/CliConfig"
import { verboseLog } from "../../src/Verbose"

export type SlackTokenFile = {
  bot_token: string
  user_token?: string
  team_id?: string
  team_name?: string
}

export type SlackClients = {
  bot: WebClient
  user?: WebClient
  teamId?: string
  teamName?: string
  tokenFile: SlackTokenFile
}

export let loadSlackTokenFile = (account: string): SlackTokenFile => {
  let tokenPath = resolveTokenReadPathForAccount(account, "slack")
  let raw = JSON.parse(fs.readFileSync(tokenPath, "utf8"))
  if (!raw.bot_token) throw new Error(`Token file for "${account}" is missing bot_token`)
  return raw as SlackTokenFile
}

export let slackClients = (account: string, verbose = false): SlackClients => {
  let tokenFile = loadSlackTokenFile(account)
  verboseLog(verbose, "slack auth", {
    account,
    hasBot: !!tokenFile.bot_token,
    hasUser: !!tokenFile.user_token,
    teamId: tokenFile.team_id,
  })
  return {
    bot: new WebClient(tokenFile.bot_token),
    user: tokenFile.user_token ? new WebClient(tokenFile.user_token) : undefined,
    teamId: tokenFile.team_id,
    teamName: tokenFile.team_name,
    tokenFile,
  }
}
