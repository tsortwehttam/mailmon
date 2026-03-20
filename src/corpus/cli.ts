import yargs from "yargs"
import type { Argv } from "yargs"
import { buildCorpus } from "./CorpusBuilder"

export let configureCorpusCli = (cli: Argv) =>
  cli
    .usage("Usage: $0 [options]")
    .option("from", {
      type: "string",
      demandOption: true,
      describe: "Root directory containing per-message folders (from ingest --sink=dir or mail export)",
    })
    .option("out-dir", {
      type: "string",
      demandOption: true,
      describe: "Directory where corpus files will be written",
    })
    .option("chunk-chars", {
      type: "number",
      default: 4000,
      coerce: (value: number) => {
        if (!Number.isFinite(value) || value < 500) throw new Error("--chunk-chars must be >= 500")
        return Math.floor(value)
      },
      describe: "Maximum characters per chunk written to chunks.jsonl",
    })
    .option("chunk-overlap-chars", {
      type: "number",
      default: 400,
      coerce: (value: number) => {
        if (!Number.isFinite(value) || value < 0) throw new Error("--chunk-overlap-chars must be >= 0")
        return Math.floor(value)
      },
      describe: "Character overlap between adjacent chunks",
    })
    .option("max-attachment-bytes", {
      type: "number",
      default: 250000,
      coerce: (value: number) => {
        if (!Number.isFinite(value) || value < 1) throw new Error("--max-attachment-bytes must be positive")
        return Math.floor(value)
      },
      describe: "Maximum bytes read from any one attachment when extracting text",
    })
    .option("max-attachment-chars", {
      type: "number",
      default: 20000,
      coerce: (value: number) => {
        if (!Number.isFinite(value) || value < 1) throw new Error("--max-attachment-chars must be positive")
        return Math.floor(value)
      },
      describe: "Maximum normalized characters kept from any one attachment",
    })
    .option("thread-excerpt-chars", {
      type: "number",
      default: 500,
      coerce: (value: number) => {
        if (!Number.isFinite(value) || value < 50) throw new Error("--thread-excerpt-chars must be >= 50")
        return Math.floor(value)
      },
      describe: "Excerpt length per message embedded in threads.jsonl",
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
      default: false,
      describe: "Print diagnostic details to stderr",
    })
    .example("$0 --from=./inbox --out-dir=./corpus", "Build corpus from ingest output")
    .example("$0 --from=./exports --out-dir=./corpus --chunk-chars=8000", "Build corpus with larger chunks")
    .epilog(
      [
        "Output:",
        "- messages.jsonl — one normalized record per message with body, headers, attachment text",
        "- chunks.jsonl — retrieval-friendly text chunks for bodies and text-like attachments",
        "- threads.jsonl — chronological thread records with per-message excerpts",
        "- summary.json — counts and file paths",
        "",
        "Input:",
        "- Reads directories containing unified.json (from ingest --sink=dir) or message.json (from mail export).",
        "- Recursively scans --from for message directories.",
      ].join("\n"),
    )
    .strict()
    .help()

export let parseCorpusCli = (args: string[], scriptName = "messagemon corpus") =>
  configureCorpusCli(yargs(args).scriptName(scriptName))
    .parseAsync()
    .then(argv => {
      let summary = buildCorpus({
        exportDir: argv.from,
        outDir: argv.outDir,
        chunkChars: argv.chunkChars,
        chunkOverlapChars: argv.chunkOverlapChars,
        maxAttachmentBytes: argv.maxAttachmentBytes,
        maxAttachmentChars: argv.maxAttachmentChars,
        threadExcerptChars: argv.threadExcerptChars,
        verbose: argv.verbose,
      })
      console.log(JSON.stringify(summary, null, 2))
    })
