// schema.ts — zod schemas for the browser-facing envelope.
//
// The gateway validates outbound envelopes before sending to the browser, and
// inbound replies/notifies from the browser before forwarding to asio. `data` is
// left as unknown (z.unknown()) — it's command-specific and validated by the VM,
// not here; our job is structural envelope validation.

import { z } from 'zod'

export const requestEnvelopeSchema = z.object({
  kind: z.literal('request'),
  requestId: z.number().int(),
  command: z.string(),
  data: z.unknown(),
  timeout: z.number(),
  timestamp: z.number(),
})

export const replyEnvelopeSchema = z.object({
  kind: z.literal('reply'),
  requestId: z.number().int(),
  command: z.string(),
  data: z.unknown(),
})

export const notifyEnvelopeSchema = z.object({
  kind: z.literal('notify'),
  command: z.string(),
  data: z.unknown(),
})

export const envelopeSchema = z.discriminatedUnion('kind', [
  requestEnvelopeSchema,
  replyEnvelopeSchema,
  notifyEnvelopeSchema,
])

export type EnvelopeInput = z.input<typeof envelopeSchema>
export type EnvelopeOutput = z.output<typeof envelopeSchema>
