// envelope.ts — the browser-facing message envelope (see implementation plan §3.4).
//
// The gateway translates asio CBOR packets to/from a stable JSON/CBOR envelope so
// the browser never parses raw CBOR. `data` here is the already-expanded JSON
// payload (the gateway decodes the inner CBOR byte string before forwarding).

export interface RequestEnvelope {
  kind: 'request'
  requestId: number
  command: string
  data: unknown
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
}

export type Envelope = RequestEnvelope | ReplyEnvelope | NotifyEnvelope
