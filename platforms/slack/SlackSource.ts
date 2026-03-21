import type { WebClient } from "@slack/web-api"
import { slackClients } from "./slackClient"
import type { MessageSource } from "../../src/ingest/ingest"
import type { UnifiedMessage } from "../../src/types"
import { toUnifiedMessage, type UserCache } from "./toUnifiedMessage"
import { verboseLog } from "../../src/Verbose"

// ---------------------------------------------------------------------------
// Channel resolution: name → ID
// ---------------------------------------------------------------------------

let resolveChannelIds = async (
  client: WebClient,
  queries: string[],
  verbose: boolean,
): Promise<Array<{ id: string; name: string }>> => {
  // If all queries look like IDs (start with C, D, or G), skip resolution
  let needsResolution = queries.some(q => q.startsWith("#") || !q.match(/^[CDG][A-Z0-9]+$/))

  let channelMap = new Map<string, string>()

  if (needsResolution) {
    // Fetch all channels to build name→id map
    let cursor: string | undefined
    while (true) {
      let res = await client.conversations.list({
        types: "public_channel,private_channel",
        limit: 1000,
        cursor,
      })
      for (let ch of res.channels ?? []) {
        if (ch.id && ch.name) channelMap.set(ch.name, ch.id)
      }
      cursor = res.response_metadata?.next_cursor || undefined
      if (!cursor) break
    }
    verboseLog(verbose, "resolved channel list", { count: channelMap.size })
  }

  let results: Array<{ id: string; name: string }> = []
  for (let q of queries) {
    let name = q.replace(/^#/, "")
    // Try as name first, then as raw ID
    let id = channelMap.get(name)
    if (id) {
      results.push({ id, name })
    } else if (q.match(/^[CDG][A-Z0-9]+$/)) {
      results.push({ id: q, name: q })
    } else if (channelMap.has(name)) {
      results.push({ id: channelMap.get(name)!, name })
    } else {
      throw new Error(`Cannot resolve channel "${q}". Not found in workspace.`)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// User cache
// ---------------------------------------------------------------------------

let populateUserCache = async (
  client: WebClient,
  userIds: Set<string>,
  cache: UserCache,
  verbose: boolean,
) => {
  let uncached = Array.from(userIds).filter(id => !cache.has(id))
  for (let userId of uncached) {
    try {
      let res = await client.users.info({ user: userId })
      let name =
        res.user?.profile?.display_name ||
        res.user?.profile?.real_name ||
        res.user?.name ||
        userId
      cache.set(userId, name)
    } catch {
      cache.set(userId, userId)
    }
  }
  if (uncached.length) verboseLog(verbose, "resolved users", { count: uncached.length })
}

// ---------------------------------------------------------------------------
// MessageSource implementation
// ---------------------------------------------------------------------------

export let slackSource: MessageSource = {
  async *listMessages(params) {
    let clients = slackClients(params.account, params.verbose)
    let bot = clients.bot

    // Parse query as comma-separated channel names/IDs
    let channelQueries = (params.query || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)

    if (channelQueries.length === 0) {
      verboseLog(params.verbose, "slack: no channels specified, skipping", { account: params.account })
      return
    }

    let channels = await resolveChannelIds(bot, channelQueries, params.verbose)
    let userCache: UserCache = new Map()
    let yielded = 0

    for (let channel of channels) {
      if (yielded >= params.maxResults) break

      verboseLog(params.verbose, "slack fetching channel", {
        channel: channel.name,
        id: channel.id,
      })

      let cursor: string | undefined
      while (yielded < params.maxResults) {
        let res = await bot.conversations.history({
          channel: channel.id,
          limit: Math.min(params.maxResults - yielded, 200),
          cursor,
        })

        let messages = res.messages ?? []
        verboseLog(params.verbose, "slack page", {
          channel: channel.name,
          fetched: messages.length,
          hasMore: res.has_more,
        })

        // Batch-resolve user IDs for this page
        let userIds = new Set<string>()
        for (let m of messages) {
          if (m.user) userIds.add(m.user)
        }
        await populateUserCache(bot, userIds, userCache, params.verbose)

        for (let msg of messages) {
          if (yielded >= params.maxResults) return
          // Skip non-message subtypes we don't care about
          if (msg.subtype === "channel_join" || msg.subtype === "channel_leave") continue
          if (!msg.ts) continue

          yield toUnifiedMessage(msg as import("./toUnifiedMessage").SlackMessage, {
            channelId: channel.id,
            channelName: channel.name,
            teamId: clients.teamId ?? "",
            userCache,
          })
          yielded += 1
        }

        cursor = res.response_metadata?.next_cursor || undefined
        if (!cursor || !res.has_more) break
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Mark-read helper
// ---------------------------------------------------------------------------

/**
 * Mark a Slack channel as read up to the given message timestamp.
 * Uses conversations.mark which updates the read cursor for the bot.
 */
export let markSlackRead = async (msg: UnifiedMessage, account: string) => {
  if (msg.platformMetadata.platform !== "slack") return
  let clients = slackClients(account)
  await clients.bot.conversations.mark({
    channel: msg.platformMetadata.channelId,
    ts: msg.platformMetadata.ts,
  })
}
