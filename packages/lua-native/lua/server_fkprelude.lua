-- server_fkprelude.lua
-- Builds the SERVER-side `fk` native table for an in-process (no-RPC) run.
-- Modeled on lua/server/rpc/fk.lua, but instead of marshaling every call over a
-- stdio JSON-RPC pipe to C++, we satisfy them LOCALLY in Lua/JS. This lets the
-- real server room logic (scheduler.lua + room.lua + gamelogic) run in wasmoon
-- with bot AI and emit the authentic packet stream a client would receive.
--
-- Leaf natives (clock/log/fs) come from injected __natives (JS). Packet output
-- (doNotify/doRequest) is captured into a global __PACKETS feed.

local __n = __natives

fk = fk or {}

-- freekill.i
function fk.GetDisabledPacks() return __n.getDisabledPacks() end
fk.FK_VER = "0.5.20"

-- qt.i
function fk.GetMicroSecond() return __n.getMicroSecond() end
function fk.qDebug(fmt, ...)    __n.qDebug(string.format(fmt, ...)) end
function fk.qInfo(fmt, ...)     __n.qInfo(string.format(fmt, ...)) end
function fk.qWarning(fmt, ...)  __n.qWarning(string.format(fmt, ...)) end
function fk.qCritical(fmt, ...) __n.qCritical(string.format(fmt, ...)) end
function print(...)
  local t = {}
  for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
  __n.qDebug(table.concat(t, "\t"))
end

fk.QList = function(arr)
  return setmetatable(arr or {}, { __index = {
    at = function(self, i) return self[i + 1] end,
    length = function(self) return #self end,
  }})
end
-- qlist iterator used by ServerRoomBase:run -> `for _, p in fk.qlist(list)`
fk.qlist = function(list)
  local i = 0
  local n = list.length and list:length() or #list
  return function()
    i = i + 1
    if i <= n then return i, (list.at and list:at(i - 1) or list[i]) end
  end
end

-- random (engine calls fk.rand(seed) -> generator with :random())
fk.rand = function(seed)
  local s = seed or os.time()
  return {
    random = function(self, low, high)
      -- mirror QRandomGenerator.random semantics used by the engine
      if high == nil then
        if low == nil or low < 1 then return math.random() end
        return math.random(1, low)
      end
      return math.random(low, high)
    end,
  }
end

-- client.i FS ops (FileIO built from these)
fk.QmlBackend_cd     = function(p) return __n.cd(p) end
fk.QmlBackend_pwd    = function() return __n.pwd() end
fk.QmlBackend_ls     = function(p)
  local jsArr = __n.ls(p); local ret = {}
  for i = 1, #jsArr do ret[i] = jsArr[i] end
  return ret
end
fk.QmlBackend_exists = function(p) return __n.exists(p) end
fk.QmlBackend_isDir  = function(p) return __n.isDir(p) end

fk._VscodeDbgEnabled = ""
fk._VscodeDbgWait = function() end
fk._rpc_finished = false

-- ---- Packet capture feed ----
__PACKETS = {}
local function capture(kind, connId, command, data)
  __PACKETS[#__PACKETS + 1] = { kind = kind, to = connId, command = command, data = data }
end

-- ---- ServerPlayer (cServerPlayer) ----
-- The engine wraps each of these in a Lua ServerPlayer. We hold mutable state and
-- emit packets. All bots => state = Robot, so the engine's AI makes replies.
local _SP_MT = { __index = {
  getId         = function(t) return t.id end,
  getScreenName = function(t) return t.screenName end,
  getAvatar     = function(t) return t.avatar end,
  getState      = function(t) return t.state end,
  setState      = function(t, v) t.state = v end,
  getTotalGameTime = function(t) return 0 end,
  addTotalGameTime = function(t) end,
  getGameData   = function(t) return fk.QList({0,0,0}) end,
  setGameData   = function(t) end,
  isDied        = function(t) return t.died end,
  setDied       = function(t, v) t.died = v end,

  doRequest   = function(t, command, json, timeout, ts)
    capture("request", t.connId, command, json)
  end,
  doNotify    = function(t, command, json) capture("notify", t.connId, command, json) end,
  -- All players are bots in this harness, so the server never waits on a human:
  -- it routes to AI. waitForReply returns "__notready" so the AI path is taken.
  waitForReply = function(t, timeout) return "__notready" end,
  thinking     = function(t) return false end,
  setThinking  = function(t, v) end,
  emitKick     = function(t) end,
  saveState        = function() return nil end,
  getSaveState     = function() return nil end,
  saveGlobalState  = function() return nil end,
  getGlobalSaveState = function() return nil end,
}}

local _players = {}
fk.__makePlayer = function(id, name, avatar)
  local p = setmetatable({
    -- Player_Trust: passes checkNoHuman() (so the game keeps running) but
    -- _checkReply() still routes to the AI (only Player_Online waits on a human).
    connId = id, id = id, screenName = name, avatar = avatar,
    state = fk.Player_Trust, died = false,
  }, _SP_MT)
  _players[id] = p
  return p
end
fk.ServerPlayer = function(t) return fk.__makePlayer(t.id, t.screenName, t.avatar) end

-- ---- Room (cRoom) ----
local _Room_MT = { __index = {
  getId        = function(t) return t.id end,
  getPlayers   = function(t) return t.players end,
  getObservers = function(t) return t.observers end,
  getOwner     = function(t) return t.players:at(0) end,
  hasObserver  = function(t) return false end,
  getTimeout   = function(t) return t.timeout end,
  settings     = function(t) return t._settings_cbor end,
  delay        = function(t, ms) end,
  isConsoleStart = function(t) return true end,
  increaseRefCount = function() end,
  decreaseRefCount = function() end,
  setRequestTimer  = function() end,
  destroyRequestTimer = function() end,
  updatePlayerWinRate = function() end,
  updateGeneralWinRate = function() end,
  gameOver = function(t) __n.qInfo("[room] gameOver " .. tostring(t.id)) end,
  getSessionId = function() return "spike" end,
  getSessionData = function() return "{}" end,
  setSessionData = function() end,
  addNpc = function() return nil end,
  removeNpc = function() end,
  saveGlobalState = function() return nil end,
  getGlobalSaveState = function() return nil end,
}}

fk.__makeRoom = function(id, players, settingsCbor, timeout)
  return setmetatable({
    id = id, players = fk.QList(players), observers = fk.QList({}),
    ownerId = players[1] and players[1].id, timeout = timeout or 15,
    _settings_cbor = settingsCbor,
  }, _Room_MT)
end

-- ---- RoomThread / Server (the scheduler's controllers) ----
local _theRoom
fk.__setRoom = function(r) _theRoom = r end
fk.RoomThread = function()
  return {
    getRoom = function(_, id) return _theRoom end,
    isConsoleStart = function() return true end,
  }
end
fk.Server = function()
  return { getTask = function(_, id) return nil end }
end
