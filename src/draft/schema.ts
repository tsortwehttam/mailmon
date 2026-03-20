import { z } from "zod"
import { Attachment } from "../serve/schema"

// ---------------------------------------------------------------------------
// Draft schemas — platform-agnostic storage, platform-specific send fields
// ---------------------------------------------------------------------------

let DraftBase = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  account: z.string().default("default"),
  label: z.string().optional(),
})

export let GmailDraft = DraftBase.extend({
  platform: z.literal("gmail"),
  to: z.string().min(1, "to is required"),
  cc: z.array(z.string()).default([]),
  bcc: z.array(z.string()).default([]),
  subject: z.string().default(""),
  body: z.string().default(""),
  from: z.string().optional(),
  replyTo: z.string().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  messageId: z.string().optional(),
  attachments: z.array(Attachment).default([]),
})
export type GmailDraft = z.infer<typeof GmailDraft>

export let SlackDraft = DraftBase.extend({
  platform: z.literal("slack"),
  channel: z.string().min(1, "channel is required"),
  text: z.string().default(""),
  threadTs: z.string().optional(),
  asUser: z.boolean().default(true),
  attachments: z.array(Attachment).default([]),
})
export type SlackDraft = z.infer<typeof SlackDraft>

export let Draft = z.discriminatedUnion("platform", [GmailDraft, SlackDraft])
export type Draft = z.infer<typeof Draft>
