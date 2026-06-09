// @freekill-web/shared — types + utilities shared between gateway and web.

/** Compatible client version reported to asio at Setup (see assets manifest). */
export interface ServerInfo {
  clientVersion: string
  serverVersion: string
}

export { Logger } from './logger.js'
export type { LogLevel, LogCategory, LogEntry, LoggerOptions } from './logger.js'
