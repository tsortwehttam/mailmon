import { gmailClient } from "../../platforms/gmail/MailSource"
import { base64url, buildRawMessage } from "../../platforms/gmail/mail"
import { slackClients, uploadFilesToChannel } from "../../platforms/slack/slackClient"
import type { Draft } from "./schema"

let resolveSlackChannelId = async (
  bot: import("@slack/web-api").WebClient,
  channel: string,
): Promise<string> => {
  if (!channel.startsWith("#")) return channel
  let r = await bot.conversations.list({
    types: "public_channel,private_channel",
    limit: 1000,
  })
  let match = (r.channels ?? []).find(c => c.name === channel.replace(/^#/, ""))
  if (!match?.id) throw new Error(`Channel "${channel}" not found`)
  return match.id
}

export let sendDraft = async (draft: Draft): Promise<unknown> => {
  if (draft.platform === "gmail") {
    let raw = buildRawMessage({
      from: draft.from,
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      replyTo: draft.replyTo,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      messageId: draft.messageId,
      subject: draft.subject,
      body: draft.body,
      attach: draft.attachments,
    })

    let client = gmailClient(draft.account)
    let r = await client.users.messages.send({
      userId: "me",
      requestBody: {
        raw: base64url(raw),
        ...(draft.threadId ? { threadId: draft.threadId } : {}),
      },
    })
    return r.data
  }

  if (draft.platform === "slack") {
    let clients = slackClients(draft.account)
    let sendClient = draft.asUser && clients.user ? clients.user : clients.bot
    let channelId = await resolveSlackChannelId(clients.bot, draft.channel)

    let messageResult: { ok?: boolean; ts?: string; channel?: string } | null = null
    if (draft.text) {
      let r = await sendClient.chat.postMessage({
        channel: channelId,
        text: draft.text,
        thread_ts: draft.threadTs,
      })
      messageResult = { ok: r.ok, ts: r.ts, channel: r.channel }
    }

    let filesUploaded = 0
    if (draft.attachments.length > 0) {
      let files = draft.attachments.map(a => ({
        filename: a.filename,
        data: Buffer.from(a.data, "base64"),
      }))
      await uploadFilesToChannel(sendClient, channelId, files, {
        threadTs: draft.threadTs ?? messageResult?.ts,
        initialComment: messageResult ? undefined : draft.text || undefined,
      })
      filesUploaded = files.length
    }

    return {
      ok: messageResult?.ok ?? true,
      ts: messageResult?.ts,
      channel: messageResult?.channel ?? channelId,
      filesUploaded,
    }
  }

  throw new Error(`Unknown platform: ${(draft as { platform: string }).platform}`)
}
