import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { PWD_CONFIG_DIR } from "../CliConfig"
import { Draft } from "./schema"

let draftsDir = () => {
  let dir = path.resolve(PWD_CONFIG_DIR, "drafts")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export let generateDraftId = () => crypto.randomUUID()

export let saveDraft = (draft: Draft) => {
  let filePath = path.resolve(draftsDir(), `${draft.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(draft, null, 2) + "\n")
  return filePath
}

export let loadDraft = (id: string): Draft => {
  let filePath = path.resolve(draftsDir(), `${id}.json`)
  if (!fs.existsSync(filePath)) throw new Error(`Draft "${id}" not found`)
  let raw = JSON.parse(fs.readFileSync(filePath, "utf8"))
  return Draft.parse(raw)
}

export let listDrafts = (platform?: string): Draft[] => {
  let dir = draftsDir()
  if (!fs.existsSync(dir)) return []
  let files = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()
  let drafts: Draft[] = []
  for (let file of files) {
    try {
      let raw = JSON.parse(fs.readFileSync(path.resolve(dir, file), "utf8"))
      let draft = Draft.parse(raw)
      if (platform && draft.platform !== platform) continue
      drafts.push(draft)
    } catch {
      // skip malformed files
    }
  }
  return drafts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export let deleteDraft = (id: string) => {
  let filePath = path.resolve(draftsDir(), `${id}.json`)
  if (!fs.existsSync(filePath)) throw new Error(`Draft "${id}" not found`)
  fs.unlinkSync(filePath)
}
