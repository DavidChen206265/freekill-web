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
  c._self = makePlayer(1, "Tester", "liubei")
  c._players[1] = c._self
  return c
end

function CppClient:notifyUI(command, data)
  -- Serialize the (already fully expanded) payload to JSON for the JS sink.
  local ok, payload = pcall(json.encode, data)
  __n.notifyUI(command, ok and payload or tostring(data))
end
function CppClient:notifyServer(command, data)
  local ok, payload = pcall(json.encode, data)
  __n.notifyServer(command, ok and payload or tostring(data))
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
