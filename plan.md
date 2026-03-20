# Plan: Add Slack platform

## Key design decisions

### Auth: dual-mode (bot token + OAuth)

Support **two** token types in the same token file:

```jsonc
// .messagemon/slack/tokens/<account>.json
{
  "bot_token": "xoxb-...",       // always present — bot token from Slack app
  "user_token": "xoxp-...",      // optional — obtained via OAuth, enables acting as user
  "team_id": "T01234ABC",
  "team_name": "My Workspace"
}
```

**`slack auth --mode=bot`** (default, simpler path):
- Prompts for bot token string (user copies from Slack app settings)
- Validates via `auth.test`, saves to token file
- Sufficient for: reading channels, listing channels, posting as bot

**`slack auth --mode=oauth`** (richer path):
- Reads `credentials.json` (client_id, client_secret) from `.messagemon/slack/`
- Starts local HTTP server, opens browser for Slack OAuth v2 install flow
- Exchanges code for both bot + user tokens
- Saves both to token file
- Required for: sending as user, `search.messages`, future live listening (Socket Mode)

The `SlackSource` and CLI commands pick the right token for each operation:
- `conversations.history`, `conversations.list`, `users.info` → bot_token
- `chat.postMessage` → user_token if available, falls back to bot_token
- `search.messages` → user_token (error if not available)

### Required scopes

**Bot scopes** (requested during OAuth, documented for manual setup):
- `channels:history`, `channels:read` — public channels
- `groups:history`, `groups:read` — private channels
- `im:history`, `mpim:history` — DMs
- `users:read` — resolve user IDs to names
- `chat:write` — post messages as bot

**User scopes** (requested during OAuth only):
- `search:read` — search messages
- `chat:write` — post messages as user

### "New" / unread message strategy

Slack has no per-message "unread" flag like email's UNREAD label. Three strategies,
all supported, selectable via `--new-strategy`:

1. **`state`** (default) — Use ingest state file (same as mail).
   A message is "new" if its ID (`channel:ts`) isn't in the state file.
   Works great for polling: first run captures recent history, subsequent runs
   only emit messages with newer timestamps. The `listMessages` generator
   fetches messages in reverse-chronological order (Slack's default) and stops
   when it hits an already-seen message OR exceeds maxResults.

2. **`oldest`** — Timestamp-based watermark. Track the newest `ts` seen per
   channel in state. On next poll, pass `oldest=last_seen_ts` to
   `conversations.history`. More efficient (fewer API calls) but coupled to
   a single channel — good for watch mode on specific channels.

3. **`mark`** — Use Slack's `conversations.mark` to track read position
   (mirrors how the Slack client works). After processing messages, call
   `conversations.mark` to advance the cursor. On next poll, use
   `conversations.history` with `oldest=` set to the marked position.
   Requires `channels:history` scope (already included). This is the closest
   analog to marking mail as read.

For `markRead` integration in `ingest.ts`:
- `state` strategy: no-op (state file handles dedup)
- `oldest` strategy: update watermark in state
- `mark` strategy: call `conversations.mark`

### Query model

`--query` for Slack accepts a **channel spec**: channel name(s) or ID(s),
comma-separated. Examples: `#general`, `C01234ABC`, `#general,#engineering`.

For `slack search`, the query is passed directly to Slack's `search.messages` API
(uses Slack's search syntax: `in:#channel from:@user "exact phrase"` etc.).

### Message ID

`{channel_id}:{ts}` — globally unique within a workspace.

### SDK

`@slack/web-api` — lightweight, official. For OAuth, we implement the flow
ourselves (simple HTTP server + token exchange) rather than pulling in `@slack/oauth`
to keep dependencies minimal.

---

## Implementation steps

### 1. Install dependency
```
npm install @slack/web-api
```

### 2. Create `platforms/slack/auth.ts`
- `slack auth` command with `--mode=bot|oauth`
- Bot mode: prompt for token, validate via `auth.test`, save
- OAuth mode: read credentials.json, start local server on random port,
  open browser to Slack OAuth URL, handle callback, exchange code,
  save both tokens
- Both modes save to `.messagemon/slack/tokens/<account>.json`

### 3. Create `platforms/slack/accounts.ts`
- `slack accounts` command: lists token files under `.messagemon/slack/tokens/`
- Reuses `resolveAllTokenDirs("slack")` from CliConfig
- Shows team_name, token types present (bot/user), for each account
- Same JSON/text output format as mail accounts

### 4. Create `platforms/slack/slackClient.ts`
- Loads token file for an account
- Returns `{ bot: WebClient, user?: WebClient, teamId, teamName }`
- Shared by all Slack commands

### 5. Create `platforms/slack/toUnifiedMessage.ts`
- Converts Slack `conversations.history` message objects to `UnifiedMessage`
- Maps: `ts` → ID, `text` → bodyText, `user` → from (resolved via users cache)
- Populates `SlackMetadata` with channelId, channelName, ts, threadTs, permalink
- Handles attachments (Slack files → `UnifiedAttachment`)
- Synthesizes subject from channel name

### 6. Create `platforms/slack/SlackSource.ts`
- Implements `MessageSource` interface
- `listMessages()` async generator:
  - Parses query into channel list (resolve names → IDs via conversations.list)
  - For each channel, calls `conversations.history` with cursor pagination
  - For `oldest` strategy, passes `oldest` param to skip seen messages
  - Yields `UnifiedMessage` via `toUnifiedMessage()`
  - Early-terminates when hitting already-seen messages (state strategy)
- Exports `markSlackRead(msg, account)` — dispatches based on strategy
- User ID → name resolution with in-memory cache

### 7. Update `platforms/slack/index.ts`
- Wire up real `auth` and `accounts` commands
- Implement `search` using `search.messages` (user token required)
- Implement `read` — fetch single message by channel + ts
- Implement `send` — post message via `chat.postMessage` (prefer user token)
- Remove stub error messages

### 8. Update `src/ingest/cli.ts` — multi-platform dispatch
- Add `--platform` flag (default: infer from account prefix)
- Update `resolveSources()` to dispatch to `slackSource` when platform is "slack"
- Account naming convention: `slack:workspace-name` → Slack, plain → mail

### 9. Tests + docs
- Unit tests for `toUnifiedMessage`
- Integration test for channel name resolution
- README: Slack setup instructions, scope requirements, auth modes
