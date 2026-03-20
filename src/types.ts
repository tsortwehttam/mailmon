/**
 * Unified message types for messagemon.
 *
 * These types represent messages from any supported platform (email, Slack,
 * Teams, WhatsApp) in a single normalized shape that downstream consumers
 * (polling, monitoring, corpus building, agent execution) can work with
 * without caring about the originating platform.
 */

// ---------------------------------------------------------------------------
// Platform enum
// ---------------------------------------------------------------------------

export type Platform = "mail" | "slack" | "teams" | "whatsapp"

// ---------------------------------------------------------------------------
// Platform-specific metadata carried alongside the unified envelope
// ---------------------------------------------------------------------------

export type MailMetadata = {
  platform: "mail"
  /** Gmail message id */
  messageId: string
  /** Gmail thread id */
  threadId?: string
  /** RFC 5322 Message-ID header */
  rfc822MessageId?: string
  /** Gmail label ids (INBOX, UNREAD, etc.) */
  labelIds?: string[]
  /** Raw MIME headers */
  headers?: Record<string, string>
}

export type SlackMetadata = {
  platform: "slack"
  /** Slack workspace id */
  teamId: string
  /** Channel / conversation id */
  channelId: string
  /** Channel name (e.g. #general) */
  channelName?: string
  /** Slack message timestamp (ts) — the canonical message identifier */
  ts: string
  /** Thread timestamp if this message is inside a thread */
  threadTs?: string
  /** Permalink URL */
  permalink?: string
}

export type TeamsMetadata = {
  platform: "teams"
  /** Microsoft Teams team id */
  teamId: string
  /** Channel id */
  channelId: string
  /** Channel display name */
  channelName?: string
  /** Message id in the Graph API */
  messageId: string
  /** Reply chain id (for threaded replies) */
  replyToId?: string
  /** Web URL to the message */
  webUrl?: string
}

export type WhatsAppMetadata = {
  platform: "whatsapp"
  /** WhatsApp Business Account id */
  wabaId: string
  /** Phone number id of the business number */
  phoneNumberId: string
  /** WhatsApp message id */
  messageId: string
  /** Remote phone number (sender or recipient) */
  remotePhone: string
  /** Message type from the Cloud API (text, image, document, …) */
  waMessageType?: string
}

export type PlatformMetadata =
  | MailMetadata
  | SlackMetadata
  | TeamsMetadata
  | WhatsAppMetadata

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

export type UnifiedAttachment = {
  filename: string
  mimeType?: string
  sizeBytes?: number
  /** URL or local path to the attachment content */
  url?: string
}

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

export type Participant = {
  /** Display name (may be absent) */
  name?: string
  /** Email, Slack user id, Teams user id, or phone number */
  address: string
}

// ---------------------------------------------------------------------------
// Unified message
// ---------------------------------------------------------------------------

export type UnifiedMessage = {
  /** Stable, platform-scoped identifier (e.g. Gmail message id, Slack ts) */
  id: string
  /** Originating platform */
  platform: Platform
  /** ISO-8601 timestamp */
  timestamp: string
  /** Message subject (email subject, or synthesized for chat platforms) */
  subject?: string
  /** Plain-text body */
  bodyText?: string
  /** HTML body (email only in most cases) */
  bodyHtml?: string
  /** Sender */
  from?: Participant
  /** Direct recipients (To in email, channel members not modelled individually) */
  to?: Participant[]
  /** CC recipients (email) */
  cc?: Participant[]
  /** BCC recipients (email) */
  bcc?: Participant[]
  /** Attachments */
  attachments?: UnifiedAttachment[]
  /** Thread / conversation identifier (platform-specific meaning) */
  threadId?: string
  /** Platform-specific metadata for operations that need the full detail */
  platformMetadata: PlatformMetadata
}
