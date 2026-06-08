// PromptText.tsx — renders a request prompt as rich text, mirroring the original
// client. In QML the prompt bar (Room.qml:378) and the box titles (GraphicsBox)
// use `textFormat: TextEdit.RichText`, so embedded markup like `<br />`, `<b>`,
// and `<font color>` renders instead of showing as literal text. React escapes
// HTML by default, so a prompt such as
//   "选择…的一名其他角色A，<br />再选择…的合法目标B。"
// would show the literal "<br />". We replicate RichText by injecting the (already
// translated + interpolated, see processPrompt.ts) string as HTML, stripping the
// same script/handler vectors as GameLogPanel's sanitize() for defense-in-depth.
//
// The prompt is produced by the local VM (trusted computation, not network input);
// sanitize() is belt-and-suspenders, not the primary trust boundary.

function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/ on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/ on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

export function PromptText({ prompt, style }: { prompt: string; style?: React.CSSProperties }) {
  return <div style={style} dangerouslySetInnerHTML={{ __html: sanitize(prompt) }} />
}
