// Simulate a mid-game page refresh: A+B start a game; A drops its WS and reconnects
// with the SAME uuid (= refresh). Check A reattaches (no fresh login) and what it
// receives. Run: ASIO_HOST=<ip> node scripts/refresh-test.mjs
import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'
if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig(); const bridge = startWsBridge(config)
const stamp = Date.now()%100000; const roomName = `rf_${stamp}`; const URL = `ws://localhost:${config.wssPort}`
const creds = (u,uuid) => ({ user:u, password:'p', uuid })
function client(user, uuid, label) {
  const ws = new WebSocket(URL); const seen=[]; const api={ws,seen,roomId:null}
  ws.on('open',()=>ws.send(JSON.stringify({kind:'notify',command:'__gateway_login',data:creds(user,uuid)})))
  ws.on('message',(r)=>{let e;try{e=JSON.parse(r.toString())}catch{return}; seen.push(e.command)
    if(label) console.log(`  [${label}] <- ${e.command}${e.data&&e.command==='__gateway_login_ok'?' '+JSON.stringify(e.data):''}`)
    if(e.command==='UpdateRoomList'&&Array.isArray(e.data)){const rm=e.data.find(x=>Array.isArray(x)&&x[1]===roomName); if(rm)api.roomId=rm[0]}})
  api.send=(c,d)=>ws.send(JSON.stringify({kind:'notify',command:c,data:d}))
  return api
}
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn,ms=8000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await wait(100)}return false}
const settings={gameMode:'aaa_role_mode',roomName,password:'',_game:{generalNum:3,generalTimeout:15,luckTime:0,enableFreeAssign:false,enableDeputy:false,enableObserverViewCard:false},_mode:{},disabledPack:[],disabledGenerals:[]}
const aUuid=`rf-A-${stamp}`
const A=client(`rfA_${stamp}`,aUuid)
await until(()=>A.seen.includes('EnterLobby'))
A.send('CreateRoom',[roomName,2,90,settings])
await until(()=>A.seen.includes('EnterRoom'))
const B=client(`rfB_${stamp}`,`rf-B-${stamp}`)
await until(()=>B.seen.includes('EnterLobby')); B.send('RefreshRoomList','')
await until(()=>B.roomId!==null)
B.send('EnterRoom',[B.roomId,'']); await until(()=>B.seen.includes('EnterRoom'))
await wait(300); B.send('Ready',''); await until(()=>A.seen.includes('ReadyChanged')||B.seen.includes('ReadyChanged'))
await wait(300); A.send('StartGame',''); await until(()=>A.seen.includes('StartGame'),10000)
console.log('game started; A pre-refresh saw AskForGeneral:', A.seen.includes('AskForGeneral'))
await until(()=>A.seen.includes('GameLog'),5000)
console.log('A saw GameLog before refresh:', A.seen.includes('GameLog'))
await wait(800)
console.log('--- A "refreshes": close WS, reconnect SAME uuid in 600ms ---')
A.ws.close()
await wait(600)
const A2=client(`rfA_${stamp}`,aUuid,'A2')
const ok=await until(()=>A2.seen.includes('__gateway_login_ok'),6000)
await wait(2500)
const gotReplay=A2.seen.includes('__gateway_log_replay')
console.log('A2 reattached? login_ok=',ok,' commands:',[...new Set(A2.seen)].join(','))
console.log('A2 got war-report replay (__gateway_log_replay)?',gotReplay)
try{A2.ws.close();B.ws.close()}catch{}
bridge.close().then(()=>process.exit(0))
