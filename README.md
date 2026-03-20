# messagemon

Multi-account message ingestion CLI. Supports Gmail and Slack; Teams and WhatsApp adapters are planned.

## Install

```bash
npm install
npm link
messagemon --help
```

To remove the global link:

```bash
npm unlink -g messagemon
```

## Gmail Setup (OAuth)

1. In Google Cloud, create/select a project, enable `Gmail API`, configure the OAuth consent screen, and create an OAuth Client ID (Desktop app).
2. Save the client JSON as `.messagemon/mail/credentials.json` (or `~/.messagemon/mail/credentials.json`).
3. Authorize an account:

```bash
messagemon mail auth --account=personal
```

4. Verify:

```bash
messagemon mail accounts --format=text
messagemon mail search "in:inbox is:unread" --account=personal
```

The tool requests scopes: `gmail.readonly`, `gmail.modify`, `gmail.send`.

## Slack Setup

### Option A: Bot token (simplest)

1. Create a Slack app at https://api.slack.com/apps.
2. Under **OAuth & Permissions**, add bot scopes: `channels:history`, `channels:read`, `groups:history`, `groups:read`, `im:history`, `mpim:history`, `users:read`, `chat:write`.
3. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`).
4. Store it:

```bash
messagemon slack auth --token=xoxb-... --account=myworkspace
```

### Option B: OAuth (enables send-as-user and search)

1. Save your app's `client_id` and `client_secret` to `.messagemon/slack/credentials.json`:
   ```json
   { "client_id": "...", "client_secret": "..." }
   ```
2. Run the OAuth flow:
   ```bash
   messagemon slack auth --mode=oauth --account=myworkspace
   ```
3. This stores both a bot token and a user token. The user token enables `search` and sending messages as yourself.

### Verify

```bash
messagemon slack accounts --format=text
messagemon slack read '#general' 1234567890.123456 --account=myworkspace
```

## Commands

### `messagemon ingest`

One-shot: scan accounts, emit new messages to a sink, then exit. Safe to run from cron.

```bash
messagemon ingest --account=work --account=personal --sink=dir --out-dir=./inbox --save-attachments
messagemon ingest --sink=ndjson > today.jsonl
messagemon ingest --sink=exec --exec-cmd='./handle.sh' --mark-read
messagemon ingest --query='from:billing@example.com' --state=./state.json
```

### `messagemon watch`

Daemon: continuously poll and emit new messages as they arrive.

```bash
messagemon watch --account=work --sink=ndjson | my-router
messagemon watch --sink=dir --out-dir=/data/inbox --save-attachments --interval-ms=10000
messagemon watch --sink=exec --exec-cmd='./agent.sh' --mark-read
```

### `messagemon corpus`

Build an LLM-oriented corpus from ingested message directories. Platform-agnostic.

```bash
messagemon corpus --from=./inbox --out-dir=./corpus
messagemon corpus --from=./inbox --out-dir=./corpus --chunk-chars=8000
```

Outputs `messages.jsonl`, `chunks.jsonl`, `threads.jsonl`, and `summary.json`.

### Sinks

Both `ingest` and `watch` support three output sinks:

| Sink | Flag | Description |
|------|------|-------------|
| **ndjson** | `--sink=ndjson` (default) | One `UnifiedMessage` JSON per line to stdout. Pipe-friendly. |
| **dir** | `--sink=dir --out-dir=PATH` | One directory per message: `unified.json`, `body.txt`, `body.html`, `headers.json`, `attachments/`. |
| **exec** | `--sink=exec --exec-cmd=CMD` | Run a shell command per message with `MESSAGEMON_*` env vars and `MESSAGEMON_JSON`. |

### Shared ingest/watch flags

| Flag | Default | Description |
|------|---------|-------------|
| `--account` | `default` | Account name(s), repeatable/comma-separated |
| `--query` | `is:unread` | Platform-native search query |
| `--max-results` | `100` | Max messages per account per cycle |
| `--mark-read` | `false` | Mark messages as read after ingestion |
| `--save-attachments` | `false` | Download attachments (dir sink only) |
| `--state` | auto-derived | Path to state file tracking ingested message IDs |
| `--interval-ms` | `5000` | Polling interval (watch only) |

### `messagemon mail`

Direct Gmail operations. All subcommands accept `--account` and `--verbose`.

| Subcommand | Description |
|------------|-------------|
| `mail auth` | Run OAuth and save token for an account |
| `mail accounts` | List available token-backed accounts |
| `mail search <query>` | Search messages; `--fetch=metadata\|full\|summary`, `--format=json\|summary` |
| `mail count <query>` | Return Gmail's `resultSizeEstimate` for a query |
| `mail thread <threadId>` | Fetch all messages in a thread; `--format=json\|text` |
| `mail read <messageId>` | Read one message; `--format=json\|text`, `--save-attachments=DIR` |
| `mail export` | Export messages to per-message directories (use `ingest --sink=dir` instead) |
| `mail send` | Send with `--to`, `--cc`, `--bcc`, `--attach`, `--thread-id`, `--yes` (required) |
| `mail mark-read <id>` | Remove UNREAD label |
| `mail archive <id>` | Remove INBOX label |

### `messagemon slack`

Direct Slack operations. All subcommands accept `--account` and `--verbose`.

| Subcommand | Description |
|------------|-------------|
| `slack auth` | Store bot token (`--mode=bot`, default) or run OAuth (`--mode=oauth`) |
| `slack accounts` | List configured Slack workspaces |
| `slack search <query>` | Search messages (requires user token with `search:read`) |
| `slack read <channel> <ts>` | Read a single message by channel + timestamp |
| `slack send` | Post a message: `--channel`, `--text`, `--as-user`, `--thread-ts` |

### Multi-platform ingest/watch

Prefix account names with `slack:` to route to the Slack adapter:

```bash
messagemon ingest --account=default --account=slack:myworkspace --query='#general'
messagemon watch --account=slack:myworkspace --query='#general,#engineering' --sink=ndjson
```

For Slack, `--query` accepts comma-separated channel names or IDs (e.g. `#general`, `C01ABC`).

## Configuration

Credentials and tokens are resolved in priority order:

1. `./.messagemon/mail/credentials.json` (project-local)
2. `<install-dir>/.messagemon/mail/credentials.json`
3. `~/.messagemon/mail/credentials.json`

Tokens are read from `<dir>/<platform>/tokens/<account>.json` across all three locations. Auth commands write tokens to `./.messagemon/<platform>/tokens/`.

Slack tokens are stored at `.messagemon/slack/tokens/<account>.json` and contain `bot_token` (always) and optionally `user_token` (from OAuth).

## Architecture

```
messagemon ingest / watch
  │
  ├─ MessageSource (async generator per platform)
  │   ├─ mailSource → toUnifiedMessage()
  │   └─ slackSource → toUnifiedMessage()
  │
  ├─ Ingest core (multi-account fan-out, state dedup)
  │
  └─ Sink (pluggable output)
      ├─ ndjson → stdout / file
      ├─ dir → unified.json + artifacts per message
      └─ exec → shell command per message

messagemon corpus
  │
  └─ Reads unified.json dirs → messages.jsonl, chunks.jsonl, threads.jsonl
```

All output uses `UnifiedMessage` — a platform-agnostic envelope defined in `src/types.ts`.

## Adding a new platform

Every platform adapter must satisfy these constraints:

1. **Implement `MessageSource`** (`src/ingest/ingest.ts`). The interface is a single method `listMessages()` returning an `AsyncGenerator<UnifiedMessage>`. This is the only contract the ingest/watch pipeline requires.

2. **Convert to `UnifiedMessage`**. Each platform needs a `toUnifiedMessage()` that maps its native message shape to the unified envelope in `src/types.ts`. Add a corresponding `PlatformMetadata` variant to the discriminated union.

3. **Credential layout**. Follow the three-tier resolution pattern (`pwd → app-install → home`): `.messagemon/<platform>/credentials.json` for app config, `.messagemon/<platform>/tokens/<account>.json` for per-account tokens. Use the helpers in `src/CliConfig.ts` with the `platform` parameter.

4. **Account dispatch**. Register the new source in `resolveSources()` in `src/ingest/cli.ts`. The convention is `<platform>:<account-name>` (e.g. `slack:myworkspace`). Plain names default to mail for backward compatibility.

5. **CLI subcommands**. Provide at minimum: `auth` (store credentials), `accounts` (list configured accounts), `read` (fetch a single message), `send` (post a message). Wire them in `platforms/<platform>/index.ts` and register the yargs command in `cli/index.ts`.

6. **Mark-read**. Implement a `markRead(msg, account)` function and add it to `resolveMarkRead()` in `src/ingest/cli.ts`. If the platform has no read-marking concept, make it a no-op.

7. **Message ID**. Must be stable and unique within the platform scope. Used as the dedup key in the ingest state file.

## Testing

```bash
npm test
```

Runs unit tests for `toUnifiedMessage`, all three sinks, and the ingest core (state management, dedup, multi-account fan-out, markRead).

## Global flags

- `--verbose` / `-v`: print diagnostics to stderr (does not affect stdout JSON shape)
