import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { google, type gmail_v1 } from "googleapis"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { DEFAULT_ACCOUNT, resolveCredentialsPath, resolveTokenReadPathForAccount } from "../../src/CliConfig"
import { buildRunDirName, exportMessageArtifacts, headerMap } from "./MessageExport"
import type { Argv } from "yargs"
import { verboseLog } from "../../src/Verbose"

type MonitorState = {
  processed: Record<string, string>
}

let loadOAuth = (account: string, verbose = false) => {
  let credentialsPath = resolveCredentialsPath()
  let tokenPath = resolveTokenReadPathForAccount(account)
  verboseLog(verbose, "monitor auth", { account, credentialsPath, tokenPath })

  let raw = JSON.parse(fs.readFileSync(credentialsPath, "utf8"))
  let c = raw.installed ?? raw.web
  if (!c?.client_id || !c?.client_secret) throw new Error("Bad credentials.json (missing client_id/client_secret)")
  let o = new google.auth.OAuth2(c.client_id, c.client_secret, (c.redirect_uris ?? [])[0])
  let t = JSON.parse(fs.readFileSync(tokenPath, "utf8"))
  o.setCredentials(t)
  return o
}

let gmail = (account: string, verbose = false) => google.gmail({ version: "v1", auth: loadOAuth(account, verbose) })

let sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let runAgent = async (command: string, cwd: string, env: Record<string, string | undefined>) =>
  new Promise<void>((resolve, reject) => {
    let child = spawn(command, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", code => {
      if (code === 0) return resolve()
      reject(new Error(`Agent command failed with exit code ${code ?? "unknown"}`))
    })
  })

let readState = (statePath: string): MonitorState => {
  if (!fs.existsSync(statePath)) return { processed: {} }
  try {
    let data = JSON.parse(fs.readFileSync(statePath, "utf8"))
    if (!data || typeof data !== "object" || typeof data.processed !== "object") return { processed: {} }
    return { processed: data.processed }
  } catch {
    return { processed: {} }
  }
}

let writeState = (statePath: string, state: MonitorState) => {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

let runMonitor = async (params: {
  account: string
  query: string
  intervalMs: number
  maxResults: number
  agentCmd: string
  prompt?: string
  promptFile?: string
  agentsMd?: string
  workRoot: string
  statePath: string
  markRead: boolean
  verbose: boolean
}) => {
  let client = gmail(params.account, params.verbose)
  let state = readState(params.statePath)

  let promptParts = [params.prompt ?? ""]
  if (params.promptFile) promptParts.push(fs.readFileSync(path.resolve(params.promptFile), "utf8"))
  let promptText = promptParts.join("\n\n").trim()

  verboseLog(params.verbose, "monitor config", {
    account: params.account,
    query: params.query,
    intervalMs: params.intervalMs,
    maxResults: params.maxResults,
    statePath: params.statePath,
    workRoot: params.workRoot,
    markRead: params.markRead,
  })

  while (true) {
    let listed = await client.users.messages.list({
      userId: "me",
      q: params.query,
      maxResults: params.maxResults,
    })
    let refs = (listed.data.messages ?? []).filter(x => x.id).reverse()
    verboseLog(params.verbose, "monitor iteration", { matched: refs.length, query: params.query })

    for (let ref of refs) {
      if (!ref.id) continue
      if (state.processed[ref.id]) continue

      let msgResponse = await client.users.messages.get({ userId: "me", id: ref.id, format: "full" })
      let msg = msgResponse.data
      let headers = headerMap(msg)
      let runDir = path.resolve(params.workRoot, buildRunDirName(ref.id, headers.subject))
      fs.mkdirSync(runDir, { recursive: true })
      await exportMessageArtifacts({ client, messageId: ref.id, message: msg, outDir: runDir })

      if (params.agentsMd) {
        let source = path.resolve(params.agentsMd)
        fs.copyFileSync(source, path.resolve(runDir, "AGENTS.md"))
      }

      let task = [
        "# Messagemon Task",
        "",
        "You are processing one Gmail message exported by `messagemon mail monitor`.",
        "Available artifacts in this directory:",
        "- `message.json` (full Gmail message payload)",
        "- `headers.json`",
        "- `body.txt` and/or `body.html`",
        "- `attachments/`",
        "",
        "You can invoke `messagemon` as needed for follow-up actions.",
        "",
        "## User Prompt",
        promptText || "(No prompt provided)",
        "",
      ].join("\n")
      fs.writeFileSync(path.resolve(runDir, "TASK.md"), task)

      verboseLog(params.verbose, "running agent", { messageId: ref.id, runDir, command: params.agentCmd })
      await runAgent(params.agentCmd, runDir, {
        MESSAGEMON_RUN_DIR: runDir,
        MESSAGEMON_MESSAGE_ID: ref.id,
        MESSAGEMON_THREAD_ID: msg.threadId ?? "",
        MESSAGEMON_ACCOUNT: params.account,
        MESSAGEMON_PLATFORM: "mail",
      })

      if (params.markRead) {
        await client.users.messages.modify({
          userId: "me",
          id: ref.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        })
      }

      state.processed[ref.id] = new Date().toISOString()
      writeState(params.statePath, state)
      console.log(
        JSON.stringify(
          {
            processedAt: state.processed[ref.id],
            account: params.account,
            messageId: ref.id,
            threadId: msg.threadId ?? null,
            runDir,
          },
          null,
          2,
        ),
      )
    }

    await sleep(params.intervalMs)
  }
}

export let configureMonitorCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 [options]")
    .option("account", {
      type: "string",
      default: DEFAULT_ACCOUNT,
      describe: "Token account name (uses .messagemon/mail/tokens/<account>.json)",
    })
    .option("query", {
      type: "string",
      default: "is:unread",
      describe: "Gmail search query to monitor",
    })
    .option("interval-ms", {
      type: "number",
      default: 5000,
      coerce: value => {
        if (!Number.isFinite(value) || value <= 0) throw new Error("--interval-ms must be a positive number")
        return Math.floor(value)
      },
      describe: "Polling interval in milliseconds",
    })
    .option("max-results", {
      type: "number",
      default: 20,
      coerce: value => {
        if (!Number.isFinite(value) || value < 1 || value > 500) throw new Error("--max-results must be 1..500")
        return Math.floor(value)
      },
      describe: "Maximum matched messages to check per poll cycle",
    })
    .option("agent-cmd", {
      type: "string",
      demandOption: true,
      describe: "Shell command to execute for each newly seen message",
    })
    .option("prompt", {
      type: "string",
      describe: "Prompt text to include in TASK.md for every message",
    })
    .option("prompt-file", {
      type: "string",
      describe: "Path to prompt file to include in TASK.md for every message",
    })
    .option("agents-md", {
      type: "string",
      describe: "Optional AGENTS.md file to copy into each run directory",
    })
    .option("work-root", {
      type: "string",
      default: path.resolve(os.tmpdir(), "messagemon"),
      describe: "Root directory where per-message run directories are created",
    })
    .option("state", {
      type: "string",
      default: "",
      describe: "Path to JSON file tracking processed message ids (default: ./.messagemon/state/monitor-<account>.json)",
    })
    .option("mark-read", {
      type: "boolean",
      default: false,
      describe: "Mark messages as read after successful agent processing",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .example(
      "$0 --account=personal --query='in:inbox is:unread' --agent-cmd='codex run \"Read TASK.md and process.\"'",
      "Monitor unread messages and run a coding agent for each new match",
    )
    .example("$0 --agent-cmd='./my-agent.sh' --prompt-file=./prompt.md --agents-md=./AGENTS.md", "Use local prompt and AGENTS instructions for each run")
    .epilog(
      [
        "Behavior:",
        "- Polls Gmail continuously using `--query`.",
        "- For each unprocessed message id, creates a run directory under `--work-root`.",
        "- Writes `message.json`, message body files, and attachment files, then executes `--agent-cmd` in that run directory.",
        "- Tracks processed message ids in `--state`.",
      ].join("\n"),
    )
    .strict()
    .help()

export let parseMonitorCli = (args: string[], scriptName = "monitor") =>
  configureMonitorCli(yargs(args).scriptName(scriptName))
    .parseAsync()
    .then(argv =>
      runMonitor({
        account: argv.account,
        query: argv.query,
        intervalMs: argv.intervalMs,
        maxResults: argv.maxResults,
        agentCmd: argv.agentCmd,
        prompt: argv.prompt,
        promptFile: argv.promptFile,
        agentsMd: argv.agentsMd,
        workRoot: path.resolve(argv.workRoot),
        statePath: argv.state
          ? path.resolve(argv.state)
          : path.resolve(process.cwd(), ".messagemon", "state", `monitor-${argv.account}.json`),
        markRead: argv.markRead,
        verbose: argv.verbose,
      }),
    )

export let runMonitorCli = (args = hideBin(process.argv), scriptName = "monitor") =>
  parseMonitorCli(args, scriptName).catch(e => {
    console.error(e?.message ?? e)
    process.exit(1)
  })

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runMonitorCli()
}
