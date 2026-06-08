-- fkprelude.lua
-- Builds the `fk` native table and the cpp_client object as REAL Lua tables,
-- so engine objects (skills, cards) created via fk.CreateSkill keep their
-- metatables. Leaf natives come from the injected `__n` table (JS).
-- Modeled on lua/server/rpc/fk.lua (the asio server's own SWIG replacement).

local __n = __natives  -- injected JS leaf functions

fk = fk or {}

-- swig/freekill.i
function fk.GetDisabledPacks() return __n.getDisabledPacks() end
fk.FK_VER = "0.5.20"

-- swig/qt.i
function fk.GetMicroSecond() return __n.getMicroSecond() end
function fk.qDebug(fmt, ...)    __n.qDebug(string.format(fmt, ...)) end
function fk.qInfo(fmt, ...)     __n.qInfo(string.format(fmt, ...)) end
function fk.qWarning(fmt, ...)  __n.qWarning(string.format(fmt, ...)) end
function fk.qCritical(fmt, ...) __n.qCritical(string.format(fmt, ...)) end

-- QList helper (engine calls list:at(i) / list:length())
fk.QList = function(arr)
  return setmetatable(arr or {}, { __index = {
    at = function(self, i) return self[i + 1] end,
    length = function(self) return #self end,
  }})
end

-- swig/client.i — QmlBackend file ops (FileIO is built from these in util.lua)
fk.QmlBackend_cd     = function(p) return __n.cd(p) end
fk.QmlBackend_pwd    = function() return __n.pwd() end
fk.QmlBackend_ls     = function(p)
  -- Copy the JS array into a fresh Lua sequence so engine code (table.removeOne,
  -- ipairs) operates on a real Lua table, not a JS proxy (which yields js_null).
  local jsArr = __n.ls(p)
  local ret = {}
  local n = #jsArr
  for i = 1, n do ret[i] = jsArr[i] end
  return ret
end
fk.QmlBackend_exists = function(p) return __n.exists(p) end
fk.QmlBackend_isDir  = function(p) return __n.isDir(p) end

-- Vscode debug hooks (no-ops)
fk._VscodeDbgEnabled = ""
fk._VscodeDbgWait = function() end
fk._VscodeDbgAttach = function() end

-- ---- cpp_client object passed to CreateLuaClient ----
-- The Lua ClientBase calls client:notifyUI / getSelf / addPlayer / removePlayer.
local _Player_MT = { __index = {
  getId            = function(t) return t.id end,
  setId            = function(t, v) t.id = v end,
  getScreenName    = function(t) return t.screenName end,
  setScreenName    = function(t, v) t.screenName = v end,
  getAvatar        = function(t) return t.avatar end,
  setAvatar        = function(t, v) t.avatar = v end,
  getState         = function(t) return t.state end,
  setState         = function(t, v) t.state = v end,
  isDied           = function(t) return t.died end,
  setDied          = function(t, v) t.died = v end,
  getGameData      = function(t) return t.gameData end,
  setGameData      = function(t, a, b, c) t.gameData = fk.QList({ a, b, c }) end,
  getTotalGameTime = function(t) return t.totalGameTime end,
  addTotalGameTime = function(t, n) t.totalGameTime = t.totalGameTime + n end,
}}

local function makePlayer(id, name, avatar)
  return setmetatable({
    id = id, screenName = name or ("p" .. id), avatar = avatar or "liubei",
    state = 1, died = false, totalGameTime = 0, gameData = fk.QList({ 0, 0, 0 }),
  }, _Player_MT)
end

CppClient = {
  _players = {},
  _self = nil,
}

function CppClient.new()
  local c = setmetatable({}, { __index = CppClient })
  c._players = {}
  -- Placeholder self: id 0 / empty name. The real identity arrives via the Setup
  -- packet (ClientBase:setup -> getSelf():setId/setScreenName/setAvatar). Using an
  -- obviously-uninitialized placeholder (not a fake "Tester") makes a missed Setup
  -- visibly wrong instead of silently mislabeling the player.
  c._self = makePlayer(0, "", "")
  c._players[0] = c._self
  return c
end

-- Make an arbitrary Lua value JSON-safe before json.encode.
-- The core occasionally puts non-serializable things in notify payloads — most
-- notably AskForUseCard's nullification extra_data.players, a list of live Player
-- objects with cyclic refs (player <-> room). lib/json.lua throws "circular
-- reference" on those, and the old tostring(data) fallback then sent the literal
-- "table: 0x..." string, which the client indexed as characters (the infamous
-- "b" prompt = the 'b' in "table"). The Qt/QML client never hits this because its
-- variant marshalling can't carry live objects either — the client only reads
-- plain ids/strings/numbers. So we drop functions/userdata/threads and break
-- cycles (seen-set), keeping the serializable shape the client actually consumes.
--
-- Mirrors lib/json.lua's array/object rule so the output never trips its
-- "mixed/invalid key types" or "sparse array" checks: a table with [1] is encoded
-- as a DENSE array (1..n, stop at the first nil), otherwise as an object with only
-- string keys.
--
-- `seen` is PERMANENT for the whole walk (NOT cleared on unwind). Clearing it would
-- only detect cycles along the current DFS path, so a dense DAG (room -> every
-- player -> room -> every player ...) re-expands each shared node along every path
-- and blows up exponentially — that caused a 2GB "Cannot enlarge memory" OOM in a
-- full game. Keeping nodes seen forever bounds the walk to O(distinct objects) and
-- dedupes shared sub-trees. Scalars aren't tracked (returned as-is), so the scalar
-- arrays the client actually reads (card-id lists etc.) never truncate; only the
-- cyclic player-object arrays the client ignores get pruned.
local function jsonSanitize(v, seen)
  local t = type(v)
  if t == "function" or t == "userdata" or t == "thread" then return nil end
  if t ~= "table" then return v end
  if seen[v] then return nil end -- already visited (cycle or shared DAG node): drop
  seen[v] = true
  local out = {}
  if rawget(v, 1) ~= nil then
    -- Array: keep contiguous 1..n (a dropped element ends the array).
    local i = 1
    while true do
      local sv = jsonSanitize(rawget(v, i), seen)
      if sv == nil then break end
      out[i] = sv
      i = i + 1
    end
  else
    -- Object: string keys only.
    for k, val in pairs(v) do
      if type(k) == "string" then
        local sv = jsonSanitize(val, seen)
        if sv ~= nil then out[k] = sv end
      end
    end
  end
  return out
end

local function safeEncode(data)
  local ok, payload = pcall(json.encode, data)
  if ok then return payload end
  -- Retry on a sanitized copy (strips cycles/functions/userdata).
  local ok2, payload2 = pcall(json.encode, jsonSanitize(data, {}))
  if ok2 then return payload2 end
  -- Last resort: an empty object, never the "table: 0x..." string.
  return "{}"
end

function CppClient:notifyUI(command, data)
  -- Serialize the (already fully expanded) payload to JSON for the JS sink.
  __n.notifyUI(command, safeEncode(data))
end
function CppClient:notifyServer(command, data)
  __n.notifyServer(command, safeEncode(data))
end
function CppClient:getSelf() return self._self end
function CppClient:changeSelf(id) self._self = self._players[id] or self._self end
function CppClient:addPlayer(id, name, avatar)
  local p = makePlayer(id, name, avatar); self._players[id] = p; return p
end
function CppClient:removePlayer(id) self._players[id] = nil end
function CppClient:sendSetupPacket() end
function CppClient:setupServerLag() end
function CppClient:saveRecord() end
function CppClient:saveGameData() end
function CppClient:installMyAESKey() end
function CppClient:isConsoleStart() return false end

__cpp_client = CppClient.new()
