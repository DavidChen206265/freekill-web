// clientVm.ts — the browser-side FreeKill client VM (wasmoon).
//
// Creates a wasmoon engine, mounts the freekill-core resource tree (fetched from
// Vite static /fk), runs the verified boot sequence, and exposes feedPacket() to
// drive ClientCallback with raw CBOR from gateway envelopes. notifyUI deltas are
// surfaced via the onNotifyUI callback. This is the first time the client logic
// layer runs in a real browser (M2).

import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient, mountFromFetch, type FileListManifest } from '@freekill-web/lua-native'
// wasmoon ships a single glue.wasm; Vite's ?url gives a correctly-served asset URL
// so the emscripten module can fetch it (custom wasm URI to LuaFactory).
import glueWasmUrl from 'wasmoon/dist/glue.wasm?url'

export interface NotifyEvent {
  command: string
  data: unknown
}

export interface ClientVmStats {
  mountFiles: number
  mountMs: number
  bootMs: number
  engine: { generals: number; cards: number; skills: number; packages: number; modes: number }
}

const FK_BASE_URL = '/fk/packages/freekill-core'
const FILE_LIST_URL = '/fk/file-list.json'
const PRELUDE_URL = '/fk/fkprelude.lua'
const VFS_CORE = '/fk/packages/freekill-core'

export interface ServerMessage {
  command: string
  data: string
}

export class ClientVm {
  private lua: Awaited<ReturnType<LuaFactory['createEngine']>> | null = null
  private notifyFeed: (e: NotifyEvent) => void
  private onServer?: (m: ServerMessage) => void
  // Pre-compiled Lua function handles. CRITICAL: lua.doString compiles a fresh
  // chunk every call and leaks the WASM Lua heap — it corrupts (_ENV becomes nil /
  // "memory access out of bounds") after only ~44 calls. Since we feed a packet +
  // read players on EVERY server packet, that's hit within the first game turn.
  // Define the hot-path helpers ONCE as globals and invoke them via handles.
  private fnFeed: ((cmd: string, hex: string, isReq: boolean) => void) | null = null
  private fnReadPlayers: (() => string) | null = null
  private fnUpdateUI: ((t: string, id: string | number, action: string, dataJson: string) => void) | null = null
  private fnFinishUI: (() => void) | null = null
  private fnReadCards: ((cidsJson: string) => string) | null = null
  private fnTranslate: ((keysJson: string) => string) | null = null
  private fnReadSkills: (() => string) | null = null
  private fnReadGenerals: ((namesJson: string) => string) | null = null
  private fnSkillData: ((name: string) => string) | null = null
  private fnSearchGenerals: ((word: string, pack: string) => string) | null = null
  private fnGeneralPacks: (() => string) | null = null
  private fnGetSetting: ((key: string) => string) | null = null
  private fnChooseGeneral: ((kind: string, argsJson: string) => string) | null = null
  private fnPoxi: ((kind: string, argsJson: string) => string) | null = null
  private fnChoiceFilter: ((argsJson: string) => string) | null = null
  private fnCardFitPattern: ((argsJson: string) => string) | null = null
  private fnVirtualEquipNames: ((argsJson: string) => string) | null = null
  private fnPlayerSkills: ((id: number) => string) | null = null
  private fnGeneralDetail: ((name: string) => string) | null = null
  private fnPlayerCards: ((id: number) => string) | null = null
  private fnGameSummary: (() => string) | null = null
  private fnResetClient: (() => string) | null = null
  private fnReadPileNum: (() => string) | null = null
  private fnChangeSelf: ((pid: number) => string) | null = null
  private fnParseLog: ((hex: string) => string) | null = null
  private fnCheckSurrender: (() => string) | null = null

  constructor(onNotifyUI: (e: NotifyEvent) => void, onNotifyServer?: (m: ServerMessage) => void) {
    this.notifyFeed = onNotifyUI
    this.onServer = onNotifyServer
  }

  /** Mount resources + boot the client engine. Returns perf stats. */
  async boot(): Promise<ClientVmStats> {
    const factory = new LuaFactory(glueWasmUrl)
    const luaModule = await factory.getLuaModule()
    const FS = (luaModule as { module: { FS: EmFS } }).module.FS

    // 1) mount resources via fetch (Vite static).
    const manifest = (await fetchJson(FILE_LIST_URL)) as FileListManifest
    const mount = await mountFromFetch(factory, luaModule, FK_BASE_URL, manifest)

    // 2) natives + engine.
    const natives = createNatives({
      emfs: FS as unknown as Parameters<typeof createNatives>[0]['emfs'],
      onNotifyUI: (e) => this.notifyFeed(e),
      onNotifyServer: (m) => this.onServer?.(m),
      log: () => {},
    })
    const lua = await factory.createEngine({ injectObjects: true })
    this.lua = lua
    FS.chdir(VFS_CORE)

    // 3) boot (prelude -> freekill.lua -> client.lua -> CreateLuaClient).
    const preludeLua = await fetchText(PRELUDE_URL)
    const tb = performance.now()
    const res = await bootClient({ lua: lua as never, natives, preludeLua })
    const bootMs = Math.round(performance.now() - tb)

    // Define the hot-path helpers ONCE (see fnFeed comment — doString leaks).
    await lua.doString(`
      local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
      function __fkFeed(cmd, hex, isReq)
        pcall(ClientCallback, ClientInstance, cmd, fromHex(hex or ""), isReq == true)
      end
      function __fkUpdateUI(elemType, id, action, dataJson)
        local ok, err = pcall(function()
          UpdateRequestUI(elemType, id, action, json.decode(dataJson))
        end)
        if not ok then __natives.qWarning("UpdateRequestUI error: " .. tostring(err)) end
      end
      -- Operation-timeout / state-leaving UI cleanup (client_util.lua FinishRequestUI):
      -- runs the request handler's _finish (clears half-built UI objects). It does NOT
      -- send a reply — the SERVER owns the real timeout and picks the default answer.
      function __fkFinishRequestUI()
        pcall(FinishRequestUI)
      end
      function __fkReadPlayers()
        local out = {}
        local ci = ClientInstance
        if ci and ci.players then
          for _, p in ipairs(ci.players) do
            local sp = p.player
            -- Player marks (Photo MarkArea + PicMarkArea). Classify by prefix exactly
            -- like RoomLogic.js SetPlayerMark (1291) + the two areas' setMark:
            --   "@!" / "@!!"  -> PICTURE mark (icon by getMarkPic), special_value =
            --                    array→count / "1"→"" / else tr(value); @!! adds desc.
            --   "@["type"]"   -> QmlMark: render GetQmlMark(type,name,pid).text (a
            --                    Lua-computed string; M5-b 阶段A). Shown as text.
            --   "@@"          -> text mark with value HIDDEN.
            --   other "@"     -> text mark, shown as "name value" where value is
            --                    array→joined tr / else tr(value).
            -- value 0 / nil is not shown (removeMark). @$/@& pile marks shown as count
            -- (click-to-view-pile deferred).
            local textMarks, picMarks = {}, {}
            if type(p.mark) == "table" then
              for k, v in pairs(p.mark) do
                if type(k) == "string" and k:startsWith("@[") then
                  -- QmlMark (@[type]name): GetQmlMark text (MarkArea.qml setMark @[
                  -- branch). The text is the whole label; value may be non-numeric, so
                  -- this is handled BEFORE the numeric gate below.
                  local close = k:find("]", 1, true)
                  if close then
                    local mtype = k:sub(3, close - 1)
                    local ok, qm = pcall(GetQmlMark, mtype, k, p.id)
                    if ok and type(qm) == "table" and type(qm.text) == "string" and qm.text ~= "" then
                      textMarks[#textMarks+1] = { name = qm.text, value = "" }
                    end
                  end
                elseif type(k) == "string" and k:startsWith("@") then
                  -- numeric value, or array length for non-cbor table values
                  local isArr = (type(v) == "table" and not Util.isCborObject(v))
                  local num = (type(v) == "number") and v or (isArr and #v) or nil
                  if num and num ~= 0 then
                    if k:startsWith("@!") then
                      -- picture mark: count (array) / "" (==1) / tr(value)
                      local sv
                      if isArr then sv = tostring(#v)
                      elseif tostring(v) == "1" then sv = ""
                      else sv = Translate(tostring(v)) end
                      local extra = k:startsWith("@!!") and (Translate(k) .. " " .. Translate(":" .. k)) or ""
                      picMarks[#picMarks+1] = { name = k, value = sv, extra = extra }
                    else
                      -- text mark: "name value" (value hidden for @@)
                      -- @$ (card pile) / @& (general pile): value is the COUNT,
                      -- not the joined names (MarkArea.qml:135-137 special_value=dat.length;
                      -- dat.join(',') is mark_extra for click-view only, not displayed).
                      local val
                      if k:startsWith("@@") then val = ""
                      elseif k:startsWith("@$") or k:startsWith("@&") then val = isArr and tostring(#v) or tostring(v)
                      elseif isArr then val = table.concat(table.map(v, function(x) return Translate(tostring(x)) end), " ")
                      else val = Translate(tostring(v)) end
                      textMarks[#textMarks+1] = { name = Translate(k), value = val }
                    end
                  end
                end
              end
            end
            out[#out+1] = {
              id = p.id, name = sp and sp:getScreenName() or "", avatar = sp and sp:getAvatar() or "",
              seat = p.seat, general = p.general, deputyGeneral = p.deputyGeneral,
              hp = p.hp, maxHp = p.maxHp, shield = p.shield, role = p.role, kingdom = p.kingdom,
              dead = p.dead, ready = p.ready, owner = p.owner,
              state = (sp and sp.getState and sp:getState()) or 0,
              chained = p.chained, dying = p.dying, role_shown = p.role_shown, faceup = p.faceup,
              -- roleVisible mirrors RoleVisibility(p.id) = Self:roleVisible(p) (player.lua:1699):
              -- whether THIS client may see p's role. Photo.qml computes the shown role as
              --   hidden -> hidden; role_shown -> role; else roleVisible ? role : "unknown".
              roleVisible = (Self ~= nil and Self.roleVisible and Self:roleVisible(p)) or false,
              sealedSlots = p.sealedSlots or {},
              equipCids = p.getCardIds and p:getCardIds("e") or {},
              judgeCids = p.getCardIds and p:getCardIds("j") or {},
              handcardNum = p.getHandcardNum and p:getHandcardNum() or 0,
              marks = textMarks,
              picMarks = picMarks,
              isSelf = (Self ~= nil and p.id == Self.id),
              -- Waiting-room win-rate panel (WaitingPhoto.qml winRateRect): getGameData()
              -- yields {total,win,run}; getTotalGameTime() the lifetime seconds. Mirrors
              -- GetPlayerGameData(pid) = {total,win,run,totalTime}. UpdateGameData sets
              -- these on the VM player; reading them per roster-sync (not a delta) keeps
              -- the snapshot model (gameStore.syncPlayers) authoritative.
              gameData = (function()
                local g = { total = 0, win = 0, run = 0, totalTime = 0 }
                -- guard the whole getGameData + qlist iteration: getGameData returns a
                -- QList (fk.qlist needs :length()); a non-QList would throw inside the loop.
                pcall(function()
                  local raw = p.player and p.player:getGameData()
                  if raw then
                    local arr = {}
                    for _, i in fk.qlist(raw) do arr[#arr+1] = i end
                    g.total, g.win, g.run = arr[1] or 0, arr[2] or 0, arr[3] or 0
                  end
                end)
                local okt, t = pcall(function() return p.player and p.player:getTotalGameTime() end)
                if okt and t then g.totalTime = t end
                return g
              end)(),
            }
          end
        end
        return json.encode(out)
      end
      -- Card faces: GetCardData(cid) -> {name,number,suit,color,type,subtype,extension,...}.
      function __fkReadCards(cidsJson)
        local out = {}
        local ok, cids = pcall(json.decode, cidsJson)
        if ok and type(cids) == "table" then
          for _, cid in ipairs(cids) do
            local d = GetCardData(cid)
            out[tostring(cid)] = { name = d.name, number = d.number, suit = d.suit,
              color = d.color, type = d.type, subtype = d.subtype, extension = d.extension,
              virt_name = d.virt_name, mark = d.mark or {} }
          end
        end
        return json.encode(out)
      end
      -- Batch translate keys via Fk:translate (slash->杀, spade->♠, skills, ...).
      function __fkTranslate(keysJson)
        local out = {}
        local ok, keys = pcall(json.decode, keysJson)
        if ok and type(keys) == "table" then
          for _, k in ipairs(keys) do out[k] = Translate(tostring(k)) end
        end
        return json.encode(out)
      end
      -- Self's visible skills, each with classification for SkillArea grouping:
      -- {orig, name, freq("active"/"notactive"), frequency("limit"/"wake"/"quest"|nil)}
      -- (GetMySkills names + GetSkillData per name; SkillArea.qml addSkill uses freq).
      function __fkReadSkills()
        local out = {}
        local ok, sk = pcall(GetMySkills)
        if ok and type(sk) == "table" then
          for _, name in ipairs(sk) do
            local d = GetSkillData(name)
            if d then
              out[#out+1] = { orig = d.orig_skill, name = d.skill, freq = d.freq, frequency = d.frequency }
            else
              out[#out+1] = { orig = name, name = name, freq = "notactive" }
            end
          end
        end
        return json.encode(out)
      end
      -- Skill classification for the LimitSkillArea (UpdateLimitSkill render): the
      -- skilltype is switchSkillName≠"" → 'switch' else frequency (limit/wake/quest)
      -- (LimitSkillItem.qml:43-45 getSkillData.frequency/switchSkillName). Localized
      -- name for the label text. Used per pid×skill from the UpdateLimitSkill command.
      function __fkSkillData(name)
        local d = GetSkillData(name)
        if not d then return "null" end
        return json.encode({ name = d.skill, frequency = d.frequency, switchSkillName = d.switchSkillName })
      end
      -- General -> {extension, kingdom} for resolving portrait paths.
      function __fkReadGenerals(namesJson)
        local out = {}
        local ok, names = pcall(json.decode, namesJson)
        if ok and type(names) == "table" then
          for _, n in ipairs(names) do
            if type(n) == "string" and n ~= "" then
              local d = GetGeneralData(n)
              out[n] = { extension = d.extension, kingdom = d.kingdom }
            end
          end
        end
        return json.encode(out)
      end
      -- FreeAssign cheat (ChooseGeneralBox.qml:175 onRightClicked → Cheat/FreeAssign.qml):
      -- when enableFreeAssign is on, the player may replace a candidate with ANY general.
      -- Returns [{name, extension, kingdom}] so the caller can register translations +
      -- face info (portrait/kingdom) in ONE round-trip — without this the FreeAssign
      -- grid showed raw pinyin + no portrait (the names were never in the popup's
      -- active.generals that vmStore registers). word filters by translated-name
      -- substring (SearchAllGenerals, ""=all); pack ("" = all) restricts to one package.
      function __fkSearchGenerals(word, pack)
        local names = {}
        if pack and pack ~= "" then
          local ok, g = pcall(GetGenerals, pack)
          if ok and type(g) == "table" then names = g end
          -- apply the word filter client-side parity: SearchAllGenerals does it per pack
          if word and word ~= "" then
            local filtered = {}
            for _, n in ipairs(names) do
              if string.find(Translate(n), word, 1, true) then filtered[#filtered+1] = n end
            end
            names = filtered
          end
        else
          local ok, g = pcall(SearchAllGenerals, word or "")
          if ok and type(g) == "table" then names = g end
        end
        local out = {}
        for _, n in ipairs(names) do
          local okd, d = pcall(GetGeneralData, n)
          out[#out+1] = okd and d and { name = n, extension = d.extension, kingdom = d.kingdom }
            or { name = n, extension = "", kingdom = "" }
        end
        return json.encode(out)
      end
      -- FreeAssign pack filter: every GeneralPack package name (GetAllGeneralPack,
      -- client_util.lua:136). Used to populate the pack <select>.
      function __fkGeneralPacks()
        local out = {}
        local ok, packs = pcall(GetAllGeneralPack)
        if ok and type(packs) == "table" then
          for _, p in ipairs(packs) do out[#out+1] = p end
        end
        return json.encode(out)
      end
      -- Read a client room setting (ClientBase:getSettings, e.g. "enableFreeAssign").
      -- Returns the JSON-encoded value (bool/number/string) or null.
      function __fkGetSetting(key)
        local ok, v = pcall(function() return ClientInstance:getSettings(key) end)
        if not ok then return "null" end
        return json.encode(v)
      end
      -- Choose-general rule helpers (ChooseGeneralBox.qml -> client_util.lua):
      -- prompt(rule,generals,extra), filter(rule,name,selected,generals,extra) per
      -- candidate's selectability, feasible(rule,selected,generals,extra) for OK.
      -- argsJson packs all params so we cross the bridge once per call.
      function __fkChooseGeneral(kind, argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok or type(a) ~= "table" then return json.encode({ r = false }) end
        local res
        if kind == "prompt" then
          res = ChooseGeneralPrompt(a.rule, a.generals or {}, a.extra)
        elseif kind == "filter" then
          res = ChooseGeneralFilter(a.rule, a.name, a.selected or {}, a.generals or {}, a.extra)
        elseif kind == "feasible" then
          res = ChooseGeneralFeasible(a.rule, a.selected or {}, a.generals or {}, a.extra)
        end
        return json.encode({ r = res })
      end
      -- PoxiBox rules (PoxiBox.qml → client_util.lua Poxi{Prompt,Filter,Feasible}).
      -- poxi_type selects a Fk.poxi_methods entry whose card_filter/feasible/prompt
      -- enforce the real selection rules. Without this the web downgraded poxi to a
      -- min0..maxAll pick that could permit illegal selections.
      --   prompt   → localized prompt string for (data, extra)
      --   filter   → is a given card selectable for the current selection
      --   feasible → is OK enabled for the current selection
      function __fkPoxi(kind, argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok or type(a) ~= "table" then return json.encode({ r = false }) end
        local res
        if kind == "prompt" then
          res = PoxiPrompt(a.poxi_type, a.data, a.extra)
        elseif kind == "filter" then
          res = PoxiFilter(a.poxi_type, a.to_select, a.selected or {}, a.data, a.extra)
        elseif kind == "feasible" then
          res = PoxiFeasible(a.poxi_type, a.selected or {}, a.data, a.extra)
        end
        return json.encode({ r = res })
      end
      -- ChooseCardsAndChoiceBox per-choice filter (ChooseCardsAndChoiceBox.qml:124):
      -- Fk.skill_skels[filter_skel].extra.choiceFilter(cards, choice, extra_data).
      -- Returns whether an OK option is enabled for the current card selection.
      -- (index-0 option is always enabled and handled on the JS side.)
      function __fkChoiceFilter(argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok or type(a) ~= "table" then return json.encode({ r = false }) end
        local skel = a.filter_skel and Fk.skill_skels and Fk.skill_skels[a.filter_skel]
        if not skel or not skel.extra or not skel.extra.choiceFilter then return json.encode({ r = true }) end
        local fok, res = pcall(skel.extra.choiceFilter, a.cards or {}, a.choice, a.extra)
        return json.encode({ r = fok and (res ~= false) })
      end
      -- Player detail (PlayerDetail.qml right-click): visible skills [{name,description}]
      -- via GetPlayerSkills(id) (client_util.lua:399). Self sees all visible skills;
      -- others hide equip/& skills. Returns [] when the player is unknown.
      function __fkPlayerSkills(id)
        local ok, sk = pcall(GetPlayerSkills, id)
        return json.encode((ok and sk) or {})
      end
      -- IG-6: general detail BY NAME (GeneralsOverview/GeneralDetailPage via
      -- GetGeneralDetail, client_util.lua:27). Unlike __fkPlayerSkills (by player id,
      -- visible-only), this is for the GENERAL-PICK box where there is no player yet —
      -- returns the general's full skill list {name,description,is_related_skill} +
      -- kingdom/hp. Skips '#'-prefixed internal skills (GeneralDetailPage:84 filter).
      function __fkGeneralDetail(name)
        local ok, d = pcall(GetGeneralDetail, name)
        if not ok or type(d) ~= "table" then return json.encode({ skill = {} }) end
        local skills = {}
        for _, s in ipairs(d.skill or {}) do
          if type(s.name) == "string" and not s.name:startsWith("#") then
            skills[#skills+1] = { name = Translate(s.name), description = s.description, related = s.is_related_skill and true or false }
          end
        end
        return json.encode({ kingdom = d.kingdom, hp = d.hp, maxHp = d.maxHp, skill = skills })
      end
      -- Card-pattern match (ArrangeCardsBox/GuanxingBox selectable: cardFitPattern).
      -- argsJson = {cids:[..], pattern:".."}; returns { r: { "<cid>": bool } }. A
      -- pattern of "" or "." matches everything (handled on the JS side too).
      function __fkCardFitPattern(argsJson)
        local out = {}
        local ok, a = pcall(json.decode, argsJson)
        if ok and type(a) == "table" and a.pattern and a.cids then
          for _, cid in ipairs(a.cids) do
            local fok, r = pcall(CardFitPattern, cid, a.pattern)
            out[tostring(cid)] = fok and (r and true or false)
          end
        end
        return json.encode({ r = out })
      end
      -- IG-4: the player's VISIBLE equip + judge cards for the detail panel
      -- (PlayerDetail.qml:291-312). For each cid in getPlayerEquips ∪ getPlayerJudges
      -- that passes CardVisibility, return the PHYSICAL card (name/suit/number — this is
      -- the "original card" for a virtual one, e.g. 大乔's 乐不思蜀's real suit/number)
      -- plus the virtual name when GetVirtualEquipData applies. Description is the
      -- ":"+name translation key (resolved client-side via tr). Hidden cards are counted.
      function __fkPlayerCards(id)
        local out, unknown = {}, 0
        local p = ClientInstance:getPlayerById(id)
        if not p then return json.encode({ cards = {}, unknown = 0 }) end
        local ej = {}
        for _, cid in ipairs(p:getCardIds("e") or {}) do ej[#ej+1] = cid end
        for _, cid in ipairs(p:getCardIds("j") or {}) do ej[#ej+1] = cid end
        for _, cid in ipairs(ej) do
          if CardVisibility(cid) then
            local t = GetCardData(cid)
            local entry = { cid = cid, name = t.name, suit = t.suit, number = t.number }
            local vok, v = pcall(GetVirtualEquipData, id, cid)
            if vok and type(v) == "table" and v.name then
              entry.virtName = v.name        -- e.g. 乐不思蜀 (the transformed name)
            end
            out[#out+1] = entry
          else
            unknown = unknown + 1
          end
        end
        return json.encode({ cards = out, unknown = unknown })
      end
      -- Virtual-equip names for MoveCardInBoardBox (RoomLogic.js:1114
      -- getVirtualEquipData(playerId, cid).name). argsJson = {pairs:[[playerId,cid]..]}
      -- → { r: { "<cid>": "<virtName>" } } only for cids that ARE virtual equips.
      function __fkVirtualEquipNames(argsJson)
        local out = {}
        local ok, a = pcall(json.decode, argsJson)
        if ok and type(a) == "table" and a.pairs then
          for _, pr in ipairs(a.pairs) do
            local vok, v = pcall(GetVirtualEquipData, pr[1], pr[2])
            if vok and type(v) == "table" and v.name then out[tostring(pr[2])] = v.name end
          end
        end
        return json.encode({ r = out })
      end
      -- GameOver summary (GameOverBox.qml): the server's GameSummary banner joined
      -- with each player's general/deputy/role from the VM mirror. Per seat:
      -- {turn,recover,damage,damaged,kill,scname} + general/deputy/role/id.
      function __fkGameSummary()
        local out = {}
        local ci = ClientInstance
        local data = ci and ci.getBanner and ci:getBanner("GameSummary")
        if type(data) ~= "table" then return json.encode(out) end
        local bySeat = {}
        if ci.players then for _, p in ipairs(ci.players) do if p.seat then bySeat[p.seat] = p end end end
        for seat, s in ipairs(data) do
          local p = bySeat[seat]
          out[#out+1] = {
            seat = seat, scname = s.scname,
            turn = s.turn or 0, recover = s.recover or 0,
            damage = s.damage or 0, damaged = s.damaged or 0, kill = s.kill or 0,
            general = p and p.general or "", deputy = p and p.deputyGeneral or "",
            role = p and p.role or "", id = p and p.id or 0,
          }
        end
        return json.encode(out)
      end
      -- Back-to-room after GameOver (RoomPage.qml resetRoomPage -> ResetClientLua).
      -- Rebuilds the client from the preserved cpp players + enter_room_data so the
      -- waiting room can render seats/owner/ready + capacity again. Returns the
      -- post-reset capacity so the JS side can repopulate its store.
      function __fkResetClient()
        local ok, err = pcall(ResetClientLua)
        if not ok then __natives.qWarning("ResetClientLua error: " .. tostring(err)) end
        local cap = (ClientInstance and ClientInstance.capacity) or 0
        return json.encode({ capacity = cap })
      end
      -- Remaining draw-pile count from the VM mirror (W1-1 2c). UpdateDrawPile is only
      -- sent on pile changes, so after a reconnect (which doesn't replay it) the count
      -- stays 0; re-read ClientInstance.draw_pile directly to re-anchor it.
      function __fkReadPileNum()
        local ci = ClientInstance
        local n = (ci and ci.draw_pile and #ci.draw_pile) or 0
        return json.encode({ pileNum = n })
      end
      -- Observer perspective switch (RoomPage.qml:512 → client.lua changeSelf): rebind
      -- the VM global Self to player pid and emit notifyUI("ChangeSelf", pid). Purely
      -- client-side (no server round-trip); observers see everything. After this the
      -- VM mirror's per-player isSelf flips, so a readPlayers re-sync re-rotates seats.
      function __fkChangeSelf(pid)
        local ok = pcall(function()
          if ClientInstance and ClientInstance.changeSelf then ClientInstance:changeSelf(pid) end
        end)
        return json.encode({ ok = ok })
      end
      -- War-report replay prettify (clientbase.lua appendLog/parseMsg): the gateway
      -- buffers the RAW inner CBOR (hex) of each GameLog (asio's reconnect resync omits
      -- past log lines). A GameLog LogMessage's fields are CBOR BYTE STRINGS, so we MUST
      -- cbor.decode the raw bytes (NOT json.decode — JSON loses the byte strings) to get
      -- the same Lua table the live path feeds parseMsg. Then run the SAME parseMsg
      -- (Client:parseMsg → localized HTML) so the rebuilt VM's mirror (players/generals/
      -- seats) resolves names exactly like the original live line. Returns HTML or "".
      function __fkParseLog(hex)
        local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
        local ok, msg = pcall(function() return cbor.decode(fromHex(hex or "")) end)
        if not ok or type(msg) ~= "table" then return "" end
        local ok2, text = pcall(function() return ClientInstance:parseMsg(msg) end)
        if not ok2 or type(text) ~= "string" then return "" end
        return text
      end
      -- RoomPage.qml surrender dialog: CheckSurrenderAvailable() returns
      -- [{ text, passed }] and an empty list means surrender is disabled.
      function __fkCheckSurrenderAvailable()
        local ok, checks = pcall(CheckSurrenderAvailable)
        if not ok or type(checks) ~= "table" then return json.encode({ ok = false, checks = {} }) end
        local out = {}
        for _, c in ipairs(checks) do
          out[#out+1] = { text = Translate(tostring(c.text)), passed = c.passed and true or false }
        end
        return json.encode({ ok = true, checks = out })
      end
    `)
    this.fnFeed = lua.global.get('__fkFeed') as typeof this.fnFeed
    this.fnReadPlayers = lua.global.get('__fkReadPlayers') as typeof this.fnReadPlayers
    this.fnUpdateUI = lua.global.get('__fkUpdateUI') as typeof this.fnUpdateUI
    this.fnFinishUI = lua.global.get('__fkFinishRequestUI') as typeof this.fnFinishUI
    this.fnReadCards = lua.global.get('__fkReadCards') as typeof this.fnReadCards
    this.fnTranslate = lua.global.get('__fkTranslate') as typeof this.fnTranslate
    this.fnReadSkills = lua.global.get('__fkReadSkills') as typeof this.fnReadSkills
    this.fnReadGenerals = lua.global.get('__fkReadGenerals') as typeof this.fnReadGenerals
    this.fnSkillData = lua.global.get('__fkSkillData') as typeof this.fnSkillData
    this.fnSearchGenerals = lua.global.get('__fkSearchGenerals') as typeof this.fnSearchGenerals
    this.fnGeneralPacks = lua.global.get('__fkGeneralPacks') as typeof this.fnGeneralPacks
    this.fnGetSetting = lua.global.get('__fkGetSetting') as typeof this.fnGetSetting
    this.fnChooseGeneral = lua.global.get('__fkChooseGeneral') as typeof this.fnChooseGeneral
    this.fnPoxi = lua.global.get('__fkPoxi') as typeof this.fnPoxi
    this.fnChoiceFilter = lua.global.get('__fkChoiceFilter') as typeof this.fnChoiceFilter
    this.fnCardFitPattern = lua.global.get('__fkCardFitPattern') as typeof this.fnCardFitPattern
    this.fnVirtualEquipNames = lua.global.get('__fkVirtualEquipNames') as typeof this.fnVirtualEquipNames
    this.fnPlayerSkills = lua.global.get('__fkPlayerSkills') as typeof this.fnPlayerSkills
    this.fnGeneralDetail = lua.global.get('__fkGeneralDetail') as typeof this.fnGeneralDetail
    this.fnPlayerCards = lua.global.get('__fkPlayerCards') as typeof this.fnPlayerCards
    this.fnGameSummary = lua.global.get('__fkGameSummary') as typeof this.fnGameSummary
    this.fnResetClient = lua.global.get('__fkResetClient') as typeof this.fnResetClient
    this.fnReadPileNum = lua.global.get('__fkReadPileNum') as typeof this.fnReadPileNum
    this.fnChangeSelf = lua.global.get('__fkChangeSelf') as typeof this.fnChangeSelf
    this.fnParseLog = lua.global.get('__fkParseLog') as typeof this.fnParseLog
    this.fnCheckSurrender = lua.global.get('__fkCheckSurrenderAvailable') as typeof this.fnCheckSurrender

    return {
      mountFiles: mount.files,
      mountMs: mount.ms,
      bootMs,
      engine: res.engine,
    }
  }

  /**
   * Feed a server packet into the client VM. `rawData` is the ORIGINAL inner CBOR
   * (from the envelope's base64 `raw`), which ClientCallback decodes itself.
   */
  async feedPacket(command: string, rawData: Uint8Array, isRequest: boolean): Promise<void> {
    if (!this.fnFeed) throw new Error('VM not booted')
    // Call the pre-compiled global (NOT doString — that leaks; see fnFeed comment).
    this.fnFeed(command, toHex(rawData), isRequest)
  }

  /**
   * Drive a UI interaction into the VM's request handler (ui_emu local loop). The
   * VM recomputes selectable/enabled state and pushes notifyUI("UpdateRequestUI",
   * change) — or notifyUI("ReplyToServer", reply) when the request finishes — back
   * through the same onNotifyUI sink. `data` is a plain JSON value (e.g. {selected}).
   */
  async updateRequestUI(elemType: string, id: string | number, action: string, data: unknown): Promise<void> {
    if (!this.fnUpdateUI) throw new Error('VM not booted')
    this.fnUpdateUI(elemType, id, action, JSON.stringify(data ?? {}))
  }

  /** UI cleanup when the operation times out / leaves the active state (does NOT
   *  reply — the server owns the real timeout). Mirrors FinishRequestUI. */
  finishRequestUI(): void {
    this.fnFinishUI?.()
  }

  close(): void {
    this.lua?.global.close()
    this.lua = null
  }

  /**
   * Read the authoritative player list from the VM's state mirror
   * (ClientInstance.players includes Self, which never arrives via AddPlayer).
   * Returns id/name/avatar/seat + game props. This is the reliable source of
   * truth — the VM owns state; deltas alone miss Self (see setup() in clientbase).
   */
  async readPlayers(): Promise<VmPlayer[]> {
    if (!this.fnReadPlayers) return []
    const json = this.fnReadPlayers()
    try { return JSON.parse(json) as VmPlayer[] } catch { return [] }
  }

  /**
   * Reset the client VM back to the waiting-room state after a game ends
   * (RoomPage.qml resetRoomPage → Lua ResetClientLua). Rebuilds ClientInstance
   * from the preserved cpp players + enter_room_data, so readPlayers() yields the
   * roster (with owner/ready) and the returned capacity drives the seat grid.
   * Returns the post-reset room capacity (0 if unavailable).
   */
  resetClientLua(): { capacity: number } {
    if (!this.fnResetClient) return { capacity: 0 }
    try { return JSON.parse(this.fnResetClient()) as { capacity: number } } catch { return { capacity: 0 } }
  }

  /** Remaining draw-pile count from the VM mirror (W1-1 2c). Re-read after a
   *  reconnect since UpdateDrawPile isn't replayed. Returns 0 if unavailable. */
  readPileNum(): number {
    if (!this.fnReadPileNum) return 0
    try { return (JSON.parse(this.fnReadPileNum()) as { pileNum: number }).pileNum || 0 } catch { return 0 }
  }

  /** Observer perspective switch: rebind VM Self to `pid` (client.lua changeSelf).
   *  Emits notifyUI("ChangeSelf", pid); caller should re-sync players afterward so
   *  seats re-rotate around the new viewpoint. */
  changeSelf(pid: number): boolean {
    if (!this.fnChangeSelf) return false
    try { return !!(JSON.parse(this.fnChangeSelf(pid)) as { ok: boolean }).ok } catch { return false }
  }

  /** Prettify a raw GameLog inner-CBOR packet into the localized HTML the live path
   *  produces (clientbase.lua appendLog → parseMsg). `rawData` is the original inner
   *  CBOR bytes (from the envelope's `raw`), which we cbor.decode + parseMsg exactly
   *  like a live GameLog — JSON is lossy for the byte-string fields. Used to render
   *  the gateway-buffered war-report replay on reconnect. Returns null on failure so
   *  the caller can fall back. */
  parseLog(rawData: Uint8Array): string | null {
    if (!this.fnParseLog) return null
    try {
      const text = this.fnParseLog(toHex(rawData))
      return text ? text : null
    } catch { return null }
  }

  /** Batch-read card faces (cid -> {name,number,suit,color,type,...}). */
  readCards(cids: number[]): Record<string, CardFace> {
    if (!this.fnReadCards || cids.length === 0) return {}
    try { return JSON.parse(this.fnReadCards(JSON.stringify(cids))) as Record<string, CardFace> } catch { return {} }
  }

  /** Batch-translate keys via the VM's Fk:translate (key -> localized text). */
  translate(keys: string[]): Record<string, string> {
    if (!this.fnTranslate || keys.length === 0) return {}
    try { return JSON.parse(this.fnTranslate(JSON.stringify(keys))) as Record<string, string> } catch { return {} }
  }

  /** Self's visible skill names. */
  readSkills(): SkillInfo[] {
    if (!this.fnReadSkills) return []
    try { return JSON.parse(this.fnReadSkills()) as SkillInfo[] } catch { return [] }
  }

  /** General name -> {extension, kingdom} for resolving portrait paths. */
  readGenerals(names: string[]): Record<string, GeneralInfo> {
    if (!this.fnReadGenerals || names.length === 0) return {}
    try { return JSON.parse(this.fnReadGenerals(JSON.stringify(names))) as Record<string, GeneralInfo> } catch { return {} }
  }

  /** Skill classification for the LimitSkillArea: {name, frequency, switchSkillName}.
   *  skilltype = switchSkillName!=='' ? 'switch' : frequency (limit/wake/quest). */
  skillData(name: string): { name: string; frequency?: string; switchSkillName?: string } | null {
    if (!this.fnSkillData) return null
    try { const v = JSON.parse(this.fnSkillData(name)); return v === null ? null : v } catch { return null }
  }

  /** FreeAssign cheat: generals (name + extension + kingdom for portrait/translation
   *  registration) matching `word` (translated-name substring, ""=all) optionally
   *  restricted to `pack` (""=all). Empty when the bridge is absent. */
  searchGenerals(word: string, pack = ''): { name: string; extension: string; kingdom: string }[] {
    if (!this.fnSearchGenerals) return []
    try { return JSON.parse(this.fnSearchGenerals(word ?? '', pack ?? '')) as { name: string; extension: string; kingdom: string }[] } catch { return [] }
  }

  /** FreeAssign pack filter: every GeneralPack package name (GetAllGeneralPack). */
  generalPacks(): string[] {
    if (!this.fnGeneralPacks) return []
    try { return JSON.parse(this.fnGeneralPacks()) as string[] } catch { return [] }
  }

  /** Read a client room setting (ClientBase:getSettings), e.g. "enableFreeAssign".
   *  Returns the decoded value or undefined. */
  getSetting(key: string): unknown {
    if (!this.fnGetSetting) return undefined
    try { const v = JSON.parse(this.fnGetSetting(key)); return v === null ? undefined : v } catch { return undefined }
  }

  /** ChooseGeneralBox rule helpers. prompt → localized prompt string; filter →
   *  whether `name` is selectable given `selected`; feasible → whether OK is
   *  enabled for `selected`. (client_util.lua ChooseGeneral{Prompt,Filter,Feasible}.) */
  chooseGeneralPrompt(rule: string, generals: string[], extra: unknown): string {
    return String(this.callChooseGeneral('prompt', { rule, generals, extra }) ?? '')
  }
  chooseGeneralFilter(rule: string, name: string, selected: string[], generals: string[], extra: unknown): boolean {
    return !!this.callChooseGeneral('filter', { rule, name, selected, generals, extra })
  }
  chooseGeneralFeasible(rule: string, selected: string[], generals: string[], extra: unknown): boolean {
    return !!this.callChooseGeneral('feasible', { rule, selected, generals, extra })
  }
  private callChooseGeneral(kind: string, args: unknown): unknown {
    if (!this.fnChooseGeneral) return undefined
    try { return (JSON.parse(this.fnChooseGeneral(kind, JSON.stringify(args))) as { r: unknown }).r } catch { return undefined }
  }

  /** PoxiBox rule helpers (PoxiBox.qml → client_util.lua Poxi{Prompt,Filter,Feasible}).
   *  prompt → localized prompt; filter → is `cid` selectable given `selected`;
   *  feasible → is OK enabled for `selected`. data/extra are the request payload. */
  poxiPrompt(poxiType: string, data: unknown, extra: unknown): string {
    return String(this.callPoxi('prompt', { poxi_type: poxiType, data, extra }) ?? '')
  }
  poxiFilter(poxiType: string, toSelect: number, selected: number[], data: unknown, extra: unknown): boolean {
    return !!this.callPoxi('filter', { poxi_type: poxiType, to_select: toSelect, selected, data, extra })
  }
  poxiFeasible(poxiType: string, selected: number[], data: unknown, extra: unknown): boolean {
    return !!this.callPoxi('feasible', { poxi_type: poxiType, selected, data, extra })
  }
  private callPoxi(kind: string, args: unknown): unknown {
    if (!this.fnPoxi) return undefined
    try { return (JSON.parse(this.fnPoxi(kind, JSON.stringify(args))) as { r: unknown }).r } catch { return undefined }
  }

  /** ChooseCardsAndChoiceBox per-choice filter (ChooseCardsAndChoiceBox.qml:124):
   *  is OK option `choice` enabled for the selected `cards`? Returns true when no
   *  filter_skel (all options allowed). The index-0 option is always allowed by the
   *  caller; this covers the rest. */
  choiceFilter(filterSkel: string, cards: number[], choice: string, extra: unknown): boolean {
    if (!this.fnChoiceFilter || !filterSkel) return true
    try { return !!(JSON.parse(this.fnChoiceFilter(JSON.stringify({ filter_skel: filterSkel, cards, choice, extra }))) as { r: unknown }).r } catch { return true }
  }

  /** Which of `cids` match the card `pattern` (ArrangeCardsBox/GuanxingBox
   *  cardFitPattern). Returns a cid→bool map. Empty / "." pattern matches all. */
  cardFitPattern(cids: number[], pattern: string): Record<string, boolean> {
    if (!this.fnCardFitPattern || !pattern || pattern === '.' || cids.length === 0) return {}
    try { return (JSON.parse(this.fnCardFitPattern(JSON.stringify({ cids, pattern }))) as { r: Record<string, boolean> }).r ?? {} } catch { return {} }
  }

  /** Virtual-equip display names for MoveCardInBoardBox (getVirtualEquipData.name).
   *  pairs = [[playerId, cid], ...]; returns cid→virtName only for virtual equips. */
  virtualEquipNames(pairs: [number, number][]): Record<string, string> {
    if (!this.fnVirtualEquipNames || pairs.length === 0) return {}
    try { return (JSON.parse(this.fnVirtualEquipNames(JSON.stringify({ pairs }))) as { r: Record<string, string> }).r ?? {} } catch { return {} }
  }

  /** Visible skills [{name, description}] of a player, for the right-click detail
   *  panel (PlayerDetail.qml → GetPlayerSkills, client_util.lua:399). */
  playerSkills(id: number): { name: string; description: string }[] {
    if (!this.fnPlayerSkills) return []
    try { return JSON.parse(this.fnPlayerSkills(id)) as { name: string; description: string }[] } catch { return [] }
  }

  /** IG-6: general detail by NAME (for the general-pick box, where there is no player
   *  yet). Skill names are already localized; `related` marks 关联技能. */
  generalDetail(name: string): GeneralDetail {
    if (!this.fnGeneralDetail) return { skill: [] }
    try { return JSON.parse(this.fnGeneralDetail(name)) as GeneralDetail } catch { return { skill: [] } }
  }

  /** IG-4: a player's visible equip + judge cards for the detail panel. Each entry is
   *  the physical card (name/suit/number — the "original" for a virtual one) + optional
   *  virtName (the transformed name, e.g. 乐不思蜀). `unknown` counts hidden cards. */
  playerCards(id: number): { cards: PlayerCardInfo[]; unknown: number } {
    if (!this.fnPlayerCards) return { cards: [], unknown: 0 }
    try { return JSON.parse(this.fnPlayerCards(id)) as { cards: PlayerCardInfo[]; unknown: number } } catch { return { cards: [], unknown: 0 } }
  }

  /** GameOver per-player summary rows (GameOverBox.qml getSummary): turn/recover/
   *  damage/damaged/kill joined with each seat's general/deputy/role. [] if absent. */
  gameSummary(): GameSummaryRow[] {
    if (!this.fnGameSummary) return []
    try { return JSON.parse(this.fnGameSummary()) as GameSummaryRow[] } catch { return [] }
  }

  /** RoomPage.qml surrender gate: [] = disabled in this mode; all passed = send
   *  PushRequest("surrender,true"). Text is already localized by the VM. */
  checkSurrenderAvailable(): { ok: boolean; checks: SurrenderCheck[] } {
    if (!this.fnCheckSurrender) return { ok: false, checks: [] }
    try { return JSON.parse(this.fnCheckSurrender()) as { ok: boolean; checks: SurrenderCheck[] } } catch { return { ok: false, checks: [] } }
  }
}

export interface SkillInfo {
  /** Internal skill name (orig_skill) — used as the UpdateRequestUI element id. */
  orig: string
  /** Localized display name. */
  name: string
  /** "active" (ActiveSkill/ViewAsSkill → a clickable button) or "notactive". */
  freq: string
  /** "limit" | "wake" | "quest" — limited/awaken/quest skills (else undefined). */
  frequency?: string
}

export interface GameSummaryRow {
  seat: number
  scname: string
  turn: number
  recover: number
  damage: number
  damaged: number
  kill: number
  general: string
  deputy: string
  role: string
  id: number
}

export interface GeneralInfo {
  extension: string
  kingdom: string
}

// IG-4: a player's visible equip/judge card for the detail panel. name/suit/number are
// the PHYSICAL card (the original for a virtual one); virtName is the transformed name.
export interface PlayerCardInfo {
  cid: number
  name: string
  suit: string
  number: number
  virtName?: string
}

// IG-6: general detail by name (GetGeneralDetail) for the general-pick skill view.
export interface GeneralDetail {
  kingdom?: string
  hp?: number
  maxHp?: number
  skill: { name: string; description: string; related?: boolean }[]
}

export interface CardFace {
  name: string
  number: number
  suit: string // "spade" | "heart" | "club" | "diamond" | "nosuit"
  color: string // "red" | "black" | "nocolor"
  type?: number
  subtype?: string // equip subtype: "weapon"/"armor"/"treasure"/"defensive_ride"/"offensive_ride"
  extension?: string // package name — needed to resolve card/equip/trick icon paths
  virt_name?: string
  /** Card marks (CardItem.qml): [{k:"@mark",v:count}], shown below the card art. */
  mark?: { k: string; v: number }[]
}

export interface VmPlayer {
  id: number
  name: string
  avatar: string
  seat?: number
  general?: string
  deputyGeneral?: string
  hp?: number
  maxHp?: number
  shield?: number
  role?: string
  kingdom?: string
  dead?: boolean
  ready?: boolean
  owner?: boolean
  state?: number
  chained?: boolean
  dying?: boolean
  role_shown?: boolean
  /** Whether this client may see the player's role — Self:roleVisible(p). */
  roleVisible?: boolean
  faceup?: boolean
  sealedSlots?: string[]
  equipCids?: number[]
  judgeCids?: number[]
  handcardNum?: number
  marks?: { name: string; value: string }[]
  picMarks?: { name: string; value: string; extra: string }[]
  isSelf?: boolean
}

export interface SurrenderCheck {
  text: string
  passed: boolean
}

interface EmFS { chdir(p: string): void }

// Fetch helpers that FAIL LOUDLY. Without the res.ok check, a Vite 404 returns
// its HTML fallback page ("<!doctype html>...") with status 200-looking content,
// which then gets fed to Lua and dies with "unexpected symbol near '<'". Guard it.
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  const text = await res.text()
  if (text.startsWith('<!doctype') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error(`fetch ${url} returned HTML (missing asset? run \`pnpm --filter web sync-assets\`)`)
  }
  return text
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return res.json()
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, '0')
  return s
}
