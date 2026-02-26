# mailmaster

`mailmaster` is a Gmail CLI for account auth, account discovery, message search/read, and message sending (including threading and attachments).

## Install

To install this repo as a global command on your machine:

```bash
npm link
```

Then run:

```bash
mailmaster --help
```

To remove the global link later:

```bash
npm unlink -g mailmaster
```

## Configuration Resolution

`mailmaster` supports both local project config and global home config.

- Credentials path resolution:
  - `./.mailmaster/credentials.json` (current working directory, preferred if present)
  - `<mailmaster-install-dir>/.mailmaster/credentials.json`
  - `~/.mailmaster/credentials.json` (fallback)
- Token read locations:
  - `./.mailmaster/tokens/*.json` (current working directory)
  - `<mailmaster-install-dir>/.mailmaster/tokens/*.json`
  - `~/.mailmaster/tokens/*.json`
- Token write location (`mailmaster auth`):
  - `./.mailmaster/tokens/` in the current working directory

Accounts are token filenames without `.json` (for example `.mailmaster/tokens/personal.json` => account `personal`).

## Top-Level Usage

```bash
mailmaster --help
mailmaster help
mailmaster help mail
mailmaster help auth
mailmaster help accounts
mailmaster help poll
```

Top-level commands:

- `mailmaster mail ...`
- `mailmaster auth ...`
- `mailmaster accounts ...`
- `mailmaster poll ...`

Global flag:

- `--verbose` / `-v`: print diagnostic information to `stderr`

## Command Reference

### `mailmaster auth`

Runs OAuth and writes a token for an account.

```bash
mailmaster auth --account=personal
```

Output:

- prints `Saved <absolute-path-to-token>`

### `mailmaster accounts`

Lists token-backed accounts available from pwd/install-dir/home token directories.

```bash
mailmaster accounts --format=json
mailmaster accounts --format=text
```

Output contract:

- `json` (default): JSON array of account names
- `text`: one account per line

### `mailmaster mail`

Subcommands:

- `search <query>`
- `read <messageId>`
- `send`

#### Search

```bash
mailmaster mail --account=personal search "from:alerts@example.com newer_than:7d"
mailmaster mail --account=personal search "in:inbox is:unread" --fetch metadata
```

Output:

- JSON array of Gmail message references (`id`, `threadId`, etc.)
- With `--fetch metadata|full`, returns:
  - `{ query, messages, resolvedMessages }`

Important search flags:

- `--max-results` maximum matched messages to return (default `20`)
- `--fetch` optional hydration mode: `none` (default), `metadata`, or `full`

#### Read

```bash
mailmaster mail --account=personal read 190cf9f55b05efcc
```

Output:

- JSON object with message metadata and headers (`From`, `To`, `Subject`, `Date`)

#### Send

Minimal send:

```bash
mailmaster mail --account=personal send \
  --to you@example.com \
  --subject "Hi" \
  --body "Hello" \
  --yes
```

Reply/thread example:

```bash
mailmaster mail --account=personal send \
  --to you@example.com \
  --subject "Re: Status" \
  --body "Following up" \
  --thread-id 190cb53f30f3d1aa \
  --in-reply-to "<original@message.id>" \
  --references "<original@message.id>" \
  --reply-to replies@example.com \
  --yes
```

Attachments/recipient example:

```bash
mailmaster mail --account=personal send \
  --to you@example.com \
  --cc team@example.com \
  --bcc audit@example.com \
  --subject "Report" \
  --body "Attached" \
  --attach ./report.pdf \
  --attach ./metrics.csv \
  --yes
```

Important send flags:

- `--yes` required safety flag (send is refused without it)
- `--to` required
- `--cc`, `--bcc`, `--attach` support repeated and comma-separated values
- `--thread-id` sets Gmail API thread routing
- `--in-reply-to` / `--references` set RFC 5322 threading headers
- `--from` optional `From` header (must be authorized in Gmail sender settings)
- `--message-id` optional Message-ID override

Output:

- JSON send response from Gmail API (includes fields such as `id`, `threadId`)

### `mailmaster poll`

Polls for Gmail query matches (default query: `is:unread`) until at least one message exists, then emits JSON and exits.

```bash
mailmaster poll --account=personal
mailmaster poll --query "in:inbox is:unread"
mailmaster poll --query "category:promotions is:unread"
mailmaster poll --query "in:inbox is:unread" --fetch metadata
mailmaster poll --query "in:inbox is:unread" --fetch full
mailmaster poll --interval-ms=2000 --out ./tmp/unread.json
```

Pipe-friendly example:

```bash
mailmaster poll --account=personal | jq '.messages[].id'
```

Important poll flags:

- `--interval-ms` polling interval in milliseconds (default `5000`)
- `--max-results` max unread messages returned once found (default `20`)
- `--query` Gmail search query to poll for (default `is:unread`)
- `--fetch` optional hydration mode: `none` (default), `metadata`, or `full`
- `--out` optional file path to also write the same JSON payload

Output:

- One JSON object to `stdout` when unread messages are found, then process exits.
- JSON shape: `{ polledAt, account, query, messages, resolvedMessages? }`

## Agent-Friendly Notes

- `mail` commands emit JSON responses suitable for automation.
- `accounts` emits JSON by default.
- `--verbose` writes diagnostics to `stderr` and does not change JSON payload shape.
