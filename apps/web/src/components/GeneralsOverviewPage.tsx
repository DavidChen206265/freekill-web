import { useEffect, useState } from 'react'
import { CatalogVm } from '../vm/catalogVm.js'
import type { CatalogGeneralDetail, CatalogGeneralListItem } from '../vm/catalogBridge.js'
import { registerTranslations, tr } from '../i18n/zh.js'
import { useCardFaceStore } from '../stores/cardFaceStore.js'
import { useServerManifestStore } from '../stores/serverManifestStore.js'
import { useDisableSchemesStore } from '../stores/disableSchemesStore.js'
import { GeneralCard } from '../table/GeneralCard.js'
import { PromptText } from '../table/PromptText.js'
import { BanGeneralSetting } from './BanGeneralSetting.js'

type Stat = 0 | 1 | 2

const BUILTIN_MOD_NAMES = new Set(['standard', 'standard_cards', 'maneuvering', 'test'])

interface ModEntry {
  name: string
  pkgs: string[]
}

export function GeneralsOverviewPage({ onClose }: { onClose: () => void }) {
  const hiddenPacks = useServerManifestStore((s) => s.hiddenPacks)
  const manifestReceived = useServerManifestStore((s) => s.received)
  const enabledPacks = useServerManifestStore((s) => s.enabledPacks)
  const curScheme = useDisableSchemesStore((s) => s.curScheme)
  const toggleBanPackage = useDisableSchemesStore((s) => s.toggleBanPackage)
  const toggleBanGeneral = useDisableSchemesStore((s) => s.toggleBanGeneral)
  const revertSelection = useDisableSchemesStore((s) => s.revertSelection)
  const saveSchemes = useDisableSchemesStore((s) => s.save)
  const [catalog, setCatalog] = useState<CatalogVm | null>(null)
  const [mods, setMods] = useState<ModEntry[]>([])
  const [modIndex, setModIndex] = useState(0)
  const [pkgIndex, setPkgIndex] = useState(0)
  const [generals, setGenerals] = useState<CatalogGeneralListItem[]>([])
  const [word, setWord] = useState('')
  const [stat, setStat] = useState<Stat>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settingOpen, setSettingOpen] = useState(false)
  const [detail, setDetail] = useState<{ name: string; data: CatalogGeneralDetail } | null>(null)

  useEffect(() => {
    let alive = true
    const vm = new CatalogVm()
    void vm.boot()
      .then(() => {
        if (!alive) { vm.close(); return }
        setCatalog(vm)
        const allPacks = new Set(vm.generalPacks())
        const modData = vm.allMods()
        const enabled = manifestReceived && enabledPacks.length > 0 ? new Set(enabledPacks) : null
        const entries = vm.allModNames()
          .filter((name) => !enabled || enabled.has(name) || BUILTIN_MOD_NAMES.has(name) || (modData[name] ?? []).some((p) => enabled.has(p)))
          .map((name) => ({
            name,
            pkgs: (modData[name] ?? []).filter((p) => allPacks.has(p) && !hiddenPacks.includes(p)),
          })).filter((m) => m.pkgs.length > 0)
        registerTranslations(vm.translate([...entries.map((m) => m.name), ...entries.flatMap((m) => m.pkgs), 'Enable', 'Prohibit']))
        setMods(entries)
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
    return () => { alive = false; vm.close() }
  }, [hiddenPacks, manifestReceived, enabledPacks])

  const packages = mods[modIndex]?.pkgs ?? []
  const currentPack = packages[pkgIndex] ?? packages[0] ?? ''

  useEffect(() => {
    if (!catalog || !currentPack) return
    const names = catalog.generals(currentPack)
    const items = catalog.generalListItems(names)
    registerGeneralItems(catalog, items)
    setGenerals(items)
  }, [catalog, currentPack])

  const doSearch = () => {
    if (!catalog) return
    const text = word.trim()
    const items = filterServerEnabledGeneralItems(
      text ? catalog.searchGenerals(text) : catalog.generalListItems(catalog.generals(currentPack)),
      manifestReceived ? enabledPacks : [],
    )
    registerGeneralItems(catalog, items)
    setGenerals(items)
    setWord('')
    if (text) { setModIndex(0); setPkgIndex(0) }
  }

  const doClose = () => {
    saveSchemes()
    onClose()
  }

  const title = stat === 1 ? '禁包编辑:点击左侧小包切换禁用' : stat === 2 ? '禁将编辑:点击武将切换禁用/启用' : '武将一览'

  return (
    <div style={styles.page}>
      <aside style={styles.side}>
        <div style={styles.modList}>
          {mods.map((m, i) => (
            <button key={m.name} type="button" style={{ ...styles.modItem, ...(i === modIndex ? styles.modActive : {}) }} onClick={() => { setModIndex(i); setPkgIndex(0) }}>
              {tr(m.name)}
            </button>
          ))}
        </div>
        <div style={styles.pkgList}>
          {packages.map((p, i) => {
            const banned = !!curScheme.banPkg[p]
            return (
              <button
                key={p}
                type="button"
                style={{ ...styles.pkgItem, ...(i === pkgIndex ? styles.pkgActive : {}), ...(banned ? styles.pkgBanned : {}) }}
                onClick={() => stat === 1 ? toggleBanPackage(p) : setPkgIndex(i)}
              >
                <span>{tr(p)}</span>
                {banned && <span aria-label="locked">🔒</span>}
              </button>
            )
          })}
        </div>
      </aside>

      <main style={styles.main}>
        <header style={{ ...styles.toolbar, background: stat === 0 ? '#5cb3cc' : '#869d9d' }}>
          <strong style={styles.title}>{title}</strong>
          <div style={styles.spacer} />
          <input
            style={styles.search}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
            placeholder="搜索武将"
          />
          <button style={styles.toolBtn} type="button" disabled={!catalog} onClick={doSearch}>搜索</button>
          <button style={styles.toolBtn} type="button" disabled={stat !== 2} onClick={() => revertSelection(generals.map((g) => ({ name: g.name, package: g.package })))}>反转选择</button>
          <button style={styles.toolBtn} type="button" disabled={stat === 1} onClick={() => setStat(stat === 2 ? 0 : 2)}>{stat === 2 ? '确定' : '禁将'}</button>
          <button style={styles.toolBtn} type="button" disabled={stat === 2} onClick={() => setStat(stat === 1 ? 0 : 1)}>{stat === 1 ? '确定' : '禁包'}</button>
          <button style={styles.toolBtn} type="button" onClick={() => setSettingOpen(true)}>禁将设置</button>
          <button style={styles.quitBtn} type="button" onClick={doClose}>退出</button>
        </header>

        <section style={styles.content}>
          {loading && <div style={styles.notice}>正在读取武将数据...</div>}
          {error && <div style={styles.notice}>读取失败: {error}</div>}
          {!loading && !error && (
            <div style={styles.grid}>
              {generals.map((g) => {
                const ban = banState(g, curScheme)
                return (
                  <div
                    key={g.name}
                    style={styles.cardBtn}
                  >
                    <GeneralCard
                      name={g.name}
                      width={93}
                      height={130}
                      onClick={() => {
                        if (stat === 2) toggleBanGeneral(g.name, g.package)
                        else setDetail({ name: g.name, data: catalog!.generalDetail(g.name) })
                      }}
                    />
                    {ban.disabled && <span style={styles.blackMask} />}
                    {ban.label && <span style={styles.banText}>{ban.label}</span>}
                  </div>
                )
              })}
              <div style={styles.footer}>共{generals.length}个武将</div>
            </div>
          )}
        </section>
      </main>

      {settingOpen && <BanGeneralSetting onClose={() => setSettingOpen(false)} />}
      {detail && <CatalogDetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function registerGeneralItems(catalog: CatalogVm, items: CatalogGeneralListItem[]): void {
  if (items.length === 0) return
  registerTranslations(catalog.translate(items.map((g) => g.name)))
  const info: Record<string, { extension: string; kingdom: string }> = {}
  for (const g of items) info[g.name] = { extension: g.extension, kingdom: g.kingdom }
  useCardFaceStore.getState().mergeGenerals(info)
}

function filterServerEnabledGeneralItems(items: CatalogGeneralListItem[], enabledPacks: string[]): CatalogGeneralListItem[] {
  if (enabledPacks.length === 0) return items
  const enabled = new Set(enabledPacks)
  return items.filter((g) => enabled.has(g.package) || enabled.has(g.extension) || BUILTIN_MOD_NAMES.has(g.extension))
}

function banState(g: CatalogGeneralListItem, scheme: { banPkg: Record<string, string[]>; normalPkg: Record<string, string[]> }): { disabled: boolean; label: string } {
  const whitelist = scheme.banPkg[g.package]
  if (whitelist) {
    if (whitelist.includes(g.name)) return { disabled: false, label: '启用' }
    return { disabled: true, label: '' }
  }
  if (scheme.normalPkg[g.package]?.includes(g.name)) return { disabled: true, label: '禁用' }
  return { disabled: false, label: '' }
}

function CatalogDetailModal({ detail, onClose }: { detail: { name: string; data: CatalogGeneralDetail }; onClose: () => void }) {
  return (
    <div style={styles.detailBackdrop} onClick={onClose}>
      <div style={styles.detailModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.detailHead}>
          <strong>{tr(detail.name)}</strong>
          <button style={styles.close} type="button" onClick={onClose}>×</button>
        </div>
        <div style={styles.detailBody}>
          <GeneralCard name={detail.name} width={93} height={130} />
          <div style={styles.skillList}>
            {detail.data.skill.length === 0 && <span style={styles.notice}>无技能信息</span>}
            {detail.data.skill.map((s) => (
              <div key={s.name} style={styles.skill}>
                <span style={{ ...styles.skillName, ...(s.related ? styles.relatedSkill : {}) }}>{s.displayName}</span>
                <PromptText prompt={s.description} style={styles.skillDesc} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', background: '#efe7d8', color: '#151515', fontFamily: 'system-ui, sans-serif' },
  side: { width: 260, display: 'flex', background: 'snow', borderRight: '1px solid #bfae8a' },
  modList: { width: 130, overflowY: 'auto', background: '#A48959' },
  pkgList: { width: 130, overflowY: 'auto', background: 'snow' },
  modItem: { width: '100%', height: 40, border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer' },
  modActive: { background: 'snow', color: '#000' },
  pkgItem: { width: '100%', minHeight: 40, border: 'none', background: 'transparent', color: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', padding: '0 4px' },
  pkgActive: { background: '#FFCC3F' },
  pkgBanned: { color: '#777' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  toolbar: { minHeight: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', color: '#101820' },
  title: { fontSize: 24, whiteSpace: 'nowrap' },
  spacer: { flex: 1 },
  search: { width: 150, padding: '7px 9px', border: '1px solid rgba(0,0,0,.25)', background: '#fff', color: '#111' },
  toolBtn: { padding: '7px 10px', border: '1px solid rgba(0,0,0,.25)', background: '#f7f7f7', color: '#111', cursor: 'pointer' },
  quitBtn: { padding: '7px 10px', border: '1px solid rgba(0,0,0,.25)', background: '#3b3b3b', color: '#fff', cursor: 'pointer' },
  content: { flex: 1, minHeight: 0, overflowY: 'auto', padding: 12, background: '#242424' },
  notice: { color: '#ddd', padding: 16 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 100px)', gridAutoRows: '140px', justifyContent: 'center', gap: 0 },
  cardBtn: { position: 'relative', width: 100, height: 140, border: 'none', background: 'transparent', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer' },
  blackMask: { position: 'absolute', inset: '5px 3px', background: 'rgba(0,0,0,.5)', borderRadius: 6, pointerEvents: 'none' },
  banText: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#E4D5A0', fontSize: 34, fontWeight: 600, textShadow: '0 0 5px #000, 0 2px 4px #000', pointerEvents: 'none' },
  footer: { gridColumn: '1 / -1', height: 40, color: 'lightgrey', textAlign: 'center', fontSize: 20, paddingTop: 8 },
  detailBackdrop: { position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center' },
  detailModal: { width: 'min(720px, 88vw)', maxHeight: '82vh', overflowY: 'auto', background: '#eee', border: '1px solid #A6967A', borderRadius: 5, padding: 16, color: '#202020' },
  detailHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 20, marginBottom: 12 },
  close: { border: 'none', background: 'transparent', fontSize: 24, cursor: 'pointer' },
  detailBody: { display: 'flex', gap: 18, alignItems: 'flex-start' },
  skillList: { display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.5 },
  skill: { display: 'block' },
  skillName: { fontWeight: 700, marginRight: 8 },
  relatedSkill: { color: '#7a319c' },
  skillDesc: { color: '#222' },
}
