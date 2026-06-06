// i18n/zh.ts — minimal static dictionary for lobby text (gameMode names etc).
//
// The authoritative translation lives in freekill-core's Lua (Fk:translate) and
// is wired in at M2 when wasmoon loads. For the lobby (no VM) we cover the common
// keys; anything missing falls back to the raw key.

const ZH: Record<string, string> = {
  aaa_role_mode: '身份模式',
  m_1v1_mode: '1v1模式',
  m_2v2_mode: '2v2模式',
  testmode: '测试模式',
}

export function tr(key: string): string {
  return ZH[key] ?? key
}
