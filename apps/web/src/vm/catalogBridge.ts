export interface CatalogGeneralData {
  package: string
  extension: string
  kingdom: string
  subkingdom?: string
  hp?: number
  maxHp?: number
  mainMaxHpAdjustedValue?: number
  deputyMaxHpAdjustedValue?: number
  shield?: number
  hidden?: boolean
  total_hidden?: boolean
}

export interface CatalogGeneralListItem extends CatalogGeneralData {
  name: string
}

export interface CatalogGeneralDetail {
  package?: string
  extension?: string
  kingdom?: string
  hp?: number
  maxHp?: number
  gender?: string
  companions: string[]
  headnote?: string
  endnote?: string
  skill: { name: string; displayName: string; description: string; related?: boolean }[]
}

export interface CatalogBridge {
  translate: (keys: string[]) => Record<string, string>
  allMods: () => Record<string, string[]>
  allModNames: () => string[]
  generalPacks: () => string[]
  generals: (pack: string) => string[]
  searchAllGeneralNames: (word: string) => string[]
  searchGeneralNames: (pack: string, word: string) => string[]
  generalData: (name: string) => CatalogGeneralData | null
  generalDetail: (name: string) => CatalogGeneralDetail
  generalListItems: (names: string[]) => CatalogGeneralListItem[]
}

interface LuaWithGlobals {
  doString(code: string): Promise<unknown>
  global: { get(name: string): unknown }
}

type LuaFn0 = () => string
type LuaFn1 = (a: string) => string
type LuaFn2 = (a: string, b: string) => string

// Mirrors Fk/Components/LunarLTK/LTKLuaUtil.qml + lua/client/client_util.lua.
// Keep this bridge read-only: the lobby catalog must not mutate ClientInstance state.
const CATALOG_BRIDGE_LUA = `
  local function catalogGeneralData(name)
    local ok, d = pcall(GetGeneralData, name)
    if not ok or type(d) ~= "table" then return nil end
    return {
      package = d.package or "",
      extension = d.extension or "",
      kingdom = d.kingdom or "",
      subkingdom = d.subkingdom,
      hp = d.hp,
      maxHp = d.maxHp,
      mainMaxHpAdjustedValue = d.mainMaxHpAdjustedValue,
      deputyMaxHpAdjustedValue = d.deputyMaxHpAdjustedValue,
      shield = d.shield,
      hidden = d.hidden and true or false,
      total_hidden = d.total_hidden and true or false,
    }
  end

  function __fkCatalogTranslate(keysJson)
    local out = {}
    local ok, keys = pcall(json.decode, keysJson)
    if ok and type(keys) == "table" then
      for _, k in ipairs(keys) do out[tostring(k)] = Translate(tostring(k)) end
    end
    return json.encode(out)
  end

  function __fkCatalogAllMods()
    local out = {}
    for _, name in ipairs(Fk.extension_names or {}) do
      local pkgs, src = {}, (Fk.extensions or {})[name] or {}
      for _, p in ipairs(src) do pkgs[#pkgs+1] = p end
      out[name] = pkgs
    end
    return json.encode(out)
  end

  function __fkCatalogAllModNames()
    local out = {}
    local ok, names = pcall(GetAllModNames)
    if ok and type(names) == "table" then
      for _, name in ipairs(names) do out[#out+1] = name end
    end
    return json.encode(out)
  end

  function __fkCatalogGeneralPacks()
    local out = {}
    local ok, packs = pcall(GetAllGeneralPack)
    if ok and type(packs) == "table" then
      for _, p in ipairs(packs) do out[#out+1] = p end
    end
    return json.encode(out)
  end

  function __fkCatalogGenerals(pack)
    local out = {}
    local ok, names = pcall(GetGenerals, pack)
    if ok and type(names) == "table" then
      for _, n in ipairs(names) do out[#out+1] = n end
    end
    return json.encode(out)
  end

  function __fkCatalogSearchAllGenerals(word)
    local out = {}
    local ok, names = pcall(SearchAllGenerals, word or "")
    if ok and type(names) == "table" then
      for _, n in ipairs(names) do out[#out+1] = n end
    end
    return json.encode(out)
  end

  function __fkCatalogSearchGenerals(pack, word)
    local out = {}
    local ok, names = pcall(SearchGenerals, pack or "", word or "")
    if ok and type(names) == "table" then
      for _, n in ipairs(names) do out[#out+1] = n end
    end
    return json.encode(out)
  end

  function __fkCatalogGeneralData(name)
    local d = catalogGeneralData(name)
    if not d then return "null" end
    return json.encode(d)
  end

  function __fkCatalogGeneralDetail(name)
    local ok, d = pcall(GetGeneralDetail, name)
    if not ok or type(d) ~= "table" then return json.encode({ skill = {}, companions = {} }) end
    local skills = {}
    for _, s in ipairs(d.skill or {}) do
      if type(s.name) == "string" and not s.name:startsWith("#") then
        skills[#skills+1] = {
          name = s.name,
          displayName = Translate(s.name),
          description = s.description or "",
          related = s.is_related_skill and true or false,
        }
      end
    end
    return json.encode({
      package = d.package,
      extension = d.extension,
      kingdom = d.kingdom,
      hp = d.hp,
      maxHp = d.maxHp,
      gender = d.gender,
      companions = d.companions or {},
      headnote = d.headnote,
      endnote = d.endnote,
      skill = skills,
    })
  end

  function __fkCatalogGeneralListItems(namesJson)
    local out = {}
    local ok, names = pcall(json.decode, namesJson)
    if ok and type(names) == "table" then
      for _, name in ipairs(names) do
        if type(name) == "string" and name ~= "" then
          local d = catalogGeneralData(name)
          if d then
            d.name = name
            out[#out+1] = d
          end
        end
      end
    end
    return json.encode(out)
  end
`

export async function installCatalogBridge(lua: LuaWithGlobals): Promise<CatalogBridge> {
  await lua.doString(CATALOG_BRIDGE_LUA)
  const translate = lua.global.get('__fkCatalogTranslate') as LuaFn1
  const allMods = lua.global.get('__fkCatalogAllMods') as LuaFn0
  const allModNames = lua.global.get('__fkCatalogAllModNames') as LuaFn0
  const generalPacks = lua.global.get('__fkCatalogGeneralPacks') as LuaFn0
  const generals = lua.global.get('__fkCatalogGenerals') as LuaFn1
  const searchAllGenerals = lua.global.get('__fkCatalogSearchAllGenerals') as LuaFn1
  const searchGenerals = lua.global.get('__fkCatalogSearchGenerals') as LuaFn2
  const generalData = lua.global.get('__fkCatalogGeneralData') as LuaFn1
  const generalDetail = lua.global.get('__fkCatalogGeneralDetail') as LuaFn1
  const generalListItems = lua.global.get('__fkCatalogGeneralListItems') as LuaFn1

  return {
    translate: (keys) => parseRecord(translate(JSON.stringify(keys))),
    allMods: () => parseRecord(allMods()),
    allModNames: () => parseArray(allModNames()),
    generalPacks: () => parseArray(generalPacks()),
    generals: (pack) => parseArray(generals(pack)),
    searchAllGeneralNames: (word) => parseArray(searchAllGenerals(word ?? '')),
    searchGeneralNames: (pack, word) => parseArray(searchGenerals(pack ?? '', word ?? '')),
    generalData: (name) => parseNullable(generalData(name)),
    generalDetail: (name) => parseDetail(generalDetail(name)),
    generalListItems: (names) => parseList(generalListItems(JSON.stringify(names))),
  }
}

function parseArray(json: string): string[] {
  try {
    const value = JSON.parse(json) as unknown
    return Array.isArray(value) ? value.map(String) : []
  } catch { return [] }
}

function parseRecord<T = string>(json: string): Record<string, T> {
  try {
    const value = JSON.parse(json) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {}
  } catch { return {} }
}

function parseNullable<T>(json: string): T | null {
  try {
    const value = JSON.parse(json) as unknown
    return value && typeof value === 'object' ? value as T : null
  } catch { return null }
}

function parseDetail(json: string): CatalogGeneralDetail {
  const detail = parseNullable<CatalogGeneralDetail>(json)
  return detail ?? { skill: [], companions: [] }
}

function parseList(json: string): CatalogGeneralListItem[] {
  try {
    const value = JSON.parse(json) as unknown
    return Array.isArray(value) ? value as CatalogGeneralListItem[] : []
  } catch { return [] }
}
