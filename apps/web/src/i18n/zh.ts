// i18n/zh.ts — translation lookup. Lobby text (no VM) uses the small static dict;
// in-game, the authoritative translations come from the VM (Fk:translate) and are
// merged into a runtime cache (see registerTranslations). tr() checks the runtime
// cache first, then the static dict, then falls back to the raw key.

const ZH: Record<string, string> = {
  aaa_role_mode: '身份模式',
  m_1v1_mode: '1v1模式',
  m_2v2_mode: '2v2模式',
  testmode: '测试模式',
  // Card-choose box area labels: client.lua:303-305 emits $Hand/$Equip/$Judge as the
  // card_data group names; values from lua/client/i18n/zh_CN.lua:373-375. These are
  // fixed client-UI i18n strings (not VM card/general content), so the static dict
  // owns them — without these tr() fell back to the raw "$Hand"/"$Equip" key.
  $Hand: '手牌区',
  $Equip: '装备区',
  $Judge: '判定区',
}

// Runtime cache filled from the VM's Fk:translate (cards/generals/skills/...).
const runtime: Record<string, string> = {}

/** Merge VM-provided translations (key -> localized text) into the runtime cache. */
export function registerTranslations(map: Record<string, string>): void {
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === 'string' && v.length > 0) runtime[k] = v
  }
}

/** True if a key already has a known translation (caller can skip re-fetching). */
export function hasTranslation(key: string): boolean {
  return key in runtime || key in ZH
}

export function tr(key: string): string {
  if (!key) return ''
  return runtime[key] ?? ZH[key] ?? key
}
