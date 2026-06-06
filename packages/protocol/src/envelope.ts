// envelope.ts — the browser-facing message envelope (see implementation plan §3.4).
//
// The gateway translates asio CBOR packets to/from a stable JSON/CBOR envelope so
// the browser never parses raw CBOR for rendering. `data` is the already-expanded
// JSON payload. `raw` (optional) carries the ORIGINAL inner CBOR bytes as base64,
// for feeding the wasmoon client VM's ClientCallback (which wants raw CBOR, not
// JSON, and won't accept cbor-x re-encoding which is not byte-identical to asio).

export interface RequestEnvelope {
  kind: 'request'
  requestId: number
  command: string
  data: unknown
  /** base64 of the original inner CBOR data (for the client VM). */
  raw?: string
  timeout: number
  timestamp: number
}

export interface ReplyEnvelope {
  kind: 'reply'
  requestId: number
  command: string
  data: unknown
}

export interface NotifyEnvelope {
  kind: 'notify'
  command: string
  data: unknown
  /** base64 of the original inner CBOR data (for the client VM). */
  raw?: string
}

export type Envelope = RequestEnvelope | ReplyEnvelope | NotifyEnvelope
