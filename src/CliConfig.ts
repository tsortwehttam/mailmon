import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Platform } from "./types"

export let DEFAULT_ACCOUNT = "default"

export let APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export let LOCAL_CONFIG_DIRNAME = ".messagemon"
export let PWD_CONFIG_DIR = path.resolve(process.cwd(), LOCAL_CONFIG_DIRNAME)
export let APP_CONFIG_DIR = path.resolve(APP_DIR, LOCAL_CONFIG_DIRNAME)
export let GLOBAL_CONFIG_DIR = path.resolve(os.homedir(), ".messagemon")
export let TOKEN_FILE_EXTENSION = ".json"

// ---------------------------------------------------------------------------
// Per-platform credential / token paths
// ---------------------------------------------------------------------------

/** Returns the three-tier config directories (pwd, app-install, home) */
export let resolveConfigDirs = () => dedupe([PWD_CONFIG_DIR, APP_CONFIG_DIR, GLOBAL_CONFIG_DIR])

/** Platform-specific credentials file (e.g. .messagemon/mail/credentials.json) */
let platformCredentialsPaths = (platform: Platform) =>
  resolveConfigDirs().map(dir => path.resolve(dir, platform, "credentials.json"))

/** Platform-specific token directory (e.g. .messagemon/mail/tokens/) */
let platformTokenDirs = (platform: Platform) =>
  resolveConfigDirs().map(dir => path.resolve(dir, platform, "tokens"))

// ---------------------------------------------------------------------------
// Legacy mail paths (kept for backward compat during migration)
// ---------------------------------------------------------------------------

export let PWD_CREDENTIALS_PATH = path.resolve(PWD_CONFIG_DIR, "credentials.json")
export let PWD_TOKENS_DIR = path.resolve(PWD_CONFIG_DIR, "tokens")
export let APP_CREDENTIALS_PATH = path.resolve(APP_CONFIG_DIR, "credentials.json")
export let APP_TOKENS_DIR = path.resolve(APP_CONFIG_DIR, "tokens")
export let GLOBAL_CREDENTIALS_PATH = path.resolve(GLOBAL_CONFIG_DIR, "credentials.json")
export let GLOBAL_TOKENS_DIR = path.resolve(GLOBAL_CONFIG_DIR, "tokens")

export let GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
]

let dedupe = (paths: string[]) => Array.from(new Set(paths.map(x => path.resolve(x))))

// ---------------------------------------------------------------------------
// Generic platform-aware resolution helpers
// ---------------------------------------------------------------------------

export let resolveCredentialsPaths = (platform?: Platform) => {
  if (platform) return dedupe(platformCredentialsPaths(platform))
  // Fallback: legacy flat layout
  return dedupe([PWD_CREDENTIALS_PATH, APP_CREDENTIALS_PATH, GLOBAL_CREDENTIALS_PATH])
}

export let resolveCredentialsPath = (platform?: Platform) => {
  let candidates = resolveCredentialsPaths(platform)
  // Also check legacy paths when using platform-specific resolution
  if (platform) {
    let legacy = dedupe([PWD_CREDENTIALS_PATH, APP_CREDENTIALS_PATH, GLOBAL_CREDENTIALS_PATH])
    candidates = dedupe([...candidates, ...legacy])
  }
  return candidates.find(x => fs.existsSync(x)) ?? candidates[0]
}

export let resolveAllTokenDirs = (platform?: Platform) => {
  if (platform) {
    return dedupe([...platformTokenDirs(platform), PWD_TOKENS_DIR, APP_TOKENS_DIR, GLOBAL_TOKENS_DIR])
  }
  return dedupe([PWD_TOKENS_DIR, APP_TOKENS_DIR, GLOBAL_TOKENS_DIR])
}

export let resolveTokenReadPathsForAccount = (account: string, platform?: Platform) =>
  resolveAllTokenDirs(platform).map(dir => path.resolve(dir, `${account}${TOKEN_FILE_EXTENSION}`))

export let resolveTokenReadPathForAccount = (account: string, platform?: Platform) => {
  let candidates = resolveTokenReadPathsForAccount(account, platform)
  let existing = candidates.find(x => fs.existsSync(x))
  if (!existing) {
    throw new Error(`Missing token for account "${account}". Checked: ${candidates.join(", ")}`)
  }
  return existing
}

export let resolveTokenWriteDir = (platform?: Platform) => {
  if (platform) return path.resolve(PWD_CONFIG_DIR, platform, "tokens")
  return PWD_TOKENS_DIR
}

export let resolveTokenWritePathForAccount = (account: string, platform?: Platform) =>
  path.resolve(resolveTokenWriteDir(platform), `${account}${TOKEN_FILE_EXTENSION}`)
