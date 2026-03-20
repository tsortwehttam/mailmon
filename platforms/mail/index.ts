/**
 * Mail (Gmail) platform — re-exports the CLI parsers so the top-level
 * dispatcher can register them under `messagemon mail …`.
 */
export { parseMailCli, configureMailCli } from "./mail"
export { parseAuthCli, configureAuthCli } from "./auth"
export { parseAccountsCli, configureAccountsCli } from "./accounts"
export { parsePollCli, configurePollCli } from "./poll"
export { parseMonitorCli, configureMonitorCli } from "./monitor"
