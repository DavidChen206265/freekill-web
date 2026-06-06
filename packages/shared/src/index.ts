// @freekill-web/shared — types shared between gateway and web.
// Placeholder: populated as cross-cutting types emerge (auth, room, lobby state).

/** Compatible client version reported to asio at Setup (see assets manifest). */
export interface ServerInfo {
  clientVersion: string
  serverVersion: string
}

export {}
