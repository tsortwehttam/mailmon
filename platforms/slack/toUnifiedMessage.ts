import type { SlackMetadata, Participant, UnifiedAttachment, UnifiedMessage } from "../../src/types"

/**
 * Slack message shape from conversations.history / conversations.replies.
 * Only the fields we use are typed here; the full API response is much larger.
 */
export type SlackMessage = {
  type?: string
  ts: string
  user?: string
  text?: string
  thread_ts?: string
  reply_count?: number
  team?: string
  files?: SlackFile[]
  attachments?: SlackAttachment[]
  permalink?: string
  /** Bot messages use bot_id instead of user */
  bot_id?: string
  /** Subtype for special messages (channel_join, bot_message, etc.) */
  subtype?: string
}

type SlackFile = {
  id: string
  name?: string
  title?: string
  mimetype?: string
  size?: number
  url_private?: string
  url_private_download?: string
  permalink?: string
}

type SlackAttachment = {
  title?: string
  text?: string
  fallback?: string
}

/** Map of Slack user IDs to display names, populated externally */
export type UserCache = Map<string, string>

export let toUnifiedMessage = (
  msg: SlackMessage,
  opts: {
    channelId: string
    channelName?: string
    teamId: string
    userCache: UserCache
    permalink?: string
  },
): UnifiedMessage => {
  let id = `${opts.channelId}:${msg.ts}`

  // Resolve sender
  let from: Participant | undefined
  if (msg.user) {
    let name = opts.userCache.get(msg.user)
    from = { address: msg.user, name }
  } else if (msg.bot_id) {
    from = { address: msg.bot_id, name: `bot:${msg.bot_id}` }
  }

  // Channel as recipient
  let to: Participant[] = [
    { address: opts.channelId, name: opts.channelName },
  ]

  // Timestamp: Slack ts is "epoch.microseconds"
  let epochSeconds = parseFloat(msg.ts)
  let timestamp = new Date(epochSeconds * 1000).toISOString()

  // Body text: the message text (already plain text from Slack, though it
  // contains mrkdwn formatting — we pass through as-is)
  let bodyText = msg.text || undefined

  // Inline attachment text (Slack "attachments" are rich-text cards, not files)
  if (msg.attachments?.length) {
    let extra = msg.attachments
      .map(a => a.text || a.fallback || a.title || "")
      .filter(Boolean)
      .join("\n---\n")
    if (extra) {
      bodyText = bodyText ? `${bodyText}\n---\n${extra}` : extra
    }
  }

  // File attachments
  let attachments: UnifiedAttachment[] | undefined
  if (msg.files?.length) {
    attachments = msg.files.map(f => ({
      filename: f.name || f.title || f.id,
      mimeType: f.mimetype,
      sizeBytes: f.size,
      url: f.url_private_download || f.url_private || f.permalink,
    }))
  }

  // Synthesize subject from channel name
  let subject = opts.channelName ? `#${opts.channelName.replace(/^#/, "")}` : `channel:${opts.channelId}`

  let metadata: SlackMetadata = {
    platform: "slack",
    teamId: opts.teamId,
    channelId: opts.channelId,
    channelName: opts.channelName,
    ts: msg.ts,
    threadTs: msg.thread_ts,
    permalink: opts.permalink ?? msg.permalink,
  }

  return {
    id,
    platform: "slack",
    timestamp,
    subject,
    bodyText,
    from,
    to,
    attachments,
    threadId: msg.thread_ts ?? msg.ts,
    platformMetadata: metadata,
  }
}
