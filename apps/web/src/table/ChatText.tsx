// ChatText.tsx — renders a chat message string, replacing `{emojiN}` tokens with the
// built-in emoji image (RoomPage.qml addToChat: msg.replace(/\{emoji(\d+)\}/g, <img
// .../image/emoji/$1.png height=16 width=16>)). Used by the room chat panel and the
// per-photo chat bubble so both show emoji like the original (others render as text).

import { Fragment } from 'react'
import { emojiPic } from './skin.js'

const EMOJI_RE = /\{emoji(\d+)\}/g

export function ChatText({ text }: { text: string }) {
  if (!text.includes('{emoji')) return <>{text}</>
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  EMOJI_RE.lastIndex = 0
  let i = 0
  while ((m = EMOJI_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<Fragment key={`t${i}`}>{text.slice(last, m.index)}</Fragment>)
    parts.push(
      <img
        key={`e${i}`}
        src={emojiPic(m[1]!)}
        alt={m[0]}
        height={16}
        width={16}
        style={{ verticalAlign: 'text-bottom', display: 'inline-block' }}
        draggable={false}
      />,
    )
    last = m.index + m[0].length
    i++
  }
  if (last < text.length) parts.push(<Fragment key={`t${i}`}>{text.slice(last)}</Fragment>)
  return <>{parts}</>
}
