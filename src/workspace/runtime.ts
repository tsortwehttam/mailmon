import path from "node:path"
import crypto from "node:crypto"
import { prependConfigDir, LOCAL_CONFIG_DIRNAME } from "../CliConfig"
import { createDirSink } from "../ingest/sinks"
import { ingestOnce } from "../ingest/ingest"
import { gmailSource, markGmailRead, fetchGmailAttachment } from "../../platforms/gmail/MailSource"
import { slackSource, markSlackRead } from "../../platforms/slack/SlackSource"
import type { MessageSource } from "../ingest/ingest"
import type { UnifiedMessage } from "../types"
import { loadWorkspaceConfig, workspaceRoot, workspaceStateRoot } from "./store"

let resolveSources = (accounts: string[], query: string, slackChannels?: string[]): Array<{ source: MessageSource; accounts: string[]; query?: string }> => {
  let gmailAccounts: string[] = []
  let slackAccounts: string[] = []

  for (let account of accounts) {
    if (account.startsWith("slack:")) {
      slackAccounts.push(account.slice("slack:".length))
    } else {
      gmailAccounts.push(account)
    }
  }

  let sources: Array<{ source: MessageSource; accounts: string[]; query?: string }> = []
  if (gmailAccounts.length) sources.push({ source: gmailSource, accounts: gmailAccounts })
  if (slackAccounts.length) {
    let slackQuery = slackChannels?.length ? slackChannels.join(",") : ""
    sources.push({ source: slackSource, accounts: slackAccounts, query: slackQuery })
  }
  return sources
}

let resolveMarkRead = (msg: UnifiedMessage, account: string) => {
  if (msg.platform === "slack") return markSlackRead(msg, account)
  return markGmailRead(msg, account)
}

export let buildWorkspaceStatePath = (workspaceId: string, accounts: string[], query: string) => {
  let key = JSON.stringify({ accounts: accounts.slice().sort(), query })
  let digest = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16)
  return path.resolve(workspaceStateRoot(workspaceId), `ingest-${digest}.json`)
}

export let refreshWorkspace = async (params: {
  workspaceId: string
  maxResults: number
  markRead: boolean
  saveAttachments: boolean
  seed: boolean
  verbose: boolean
}) => {
  let config = loadWorkspaceConfig(params.workspaceId)
  let root = workspaceRoot(config.id)
  let inboxDir = path.resolve(root, "inbox")

  prependConfigDir(path.resolve(root, LOCAL_CONFIG_DIRNAME))

  let dirSink = createDirSink({
    outDir: inboxDir,
    saveAttachments: params.saveAttachments,
    fetchAttachment: params.saveAttachments
      ? (msg, filename) => fetchGmailAttachment(msg, filename, config.accounts[0] ?? "default")
      : undefined,
  })

  return ingestOnce({
    sources: resolveSources(config.accounts, config.query, config.slackChannels),
    query: config.query,
    maxResults: params.maxResults,
    sink: dirSink,
    statePath: buildWorkspaceStatePath(config.id, config.accounts, config.query),
    markRead: resolveMarkRead,
    doMarkRead: params.markRead,
    seed: params.seed,
    verbose: params.verbose,
  })
}
