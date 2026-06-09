// Verify reconnect timer sync: capture a live request's timeout/timestamp pre-drop,
// then after reconnect, and report whether the server PRESERVES the original window
// (true sync) or RESETS it (timer restarts). Run: ASIO_HOST=<ip> node scripts/timer-sync-test.mjs
import { WebSocket } from 'ws'
import { loadConfig } from '../dist/config.js'
import { startWsBridge } from '../dist/ws-bridge.js'
if (!process.env.ASIO_HOST) { console.error('ASIO_HOST not set'); process.exit(2) }
const config = loadConfig(); const bridge = startWsBridge(config)
const stamp = Date.now()%100000; const roomName = `ts_${stamp}`; const URL = `ws://localhost:${config.wssPort}`
const creds=(u,uuid)=>({user:u,password:'p',uuid})
function client(user, uuid, label){
  const ws=new WebSocket(URL); const seen=[]; const reqs=[]; const api={ws,seen,reqs,roomId:null}
  ws.on('open',()=>ws.send(JSON.stringify({kind:'notify',command:'__gateway_login',data:creds(user,uuid)})))
  ws.on('message',(r)=>{let e;try{e=JSON.parse(r.toString())}catch{return}; seen.push(e.command)
    if(e.kind==='request'){ reqs.push({command:e.command,requestId:e.requestId,timeout:e.timeout,timestamp:e.timestamp}); if(label)console.log(`  [${label}] REQUEST ${e.command} timeout=${e.timeout} timestamp=${e.timestamp} reqId=${e.requestId}`) }
    if(e.command==='UpdateRoomList'&&Array.isArray(e.data)){const rm=e.data.find(x=>Array.isArray(x)&&x[1]===roomName); if(rm)api.roomId=rm[0]}})
  api.send=(c,d)=>ws.send(JSON.stringify({kind:'notify',command:c,data:d}))
  return api
}
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
const until=async(fn,ms=8000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await wait(100)}return false}
const settings={gameMode:'aaa_role_mode',roomName,password:'',_game:{generalNum:3,generalTimeout:15,luckTime:0,enableFreeAssign:false,enableDeputy:false,enableObserverViewCard:false},_mode:{},disabledPack:[],disabledGenerals:[]}
const aUuid=`ts-A-${stamp}`
const A=client(`tsA_${stamp}`,aUuid,'A')
await until(()=>A.seen.includes('EnterLobby')); A.send('CreateRoom',[roomName,2,90,settings]); await until(()=>A.seen.includes('EnterRoom'))
const B=client(`tsB_${stamp}`,`ts-B-${stamp}`); await until(()=>B.seen.includes('EnterLobby')); B.send('RefreshRoomList',''); await until(()=>B.roomId!==null)
B.send('EnterRoom',[B.roomId,'']); await until(()=>B.seen.includes('EnterRoom')); await wait(300); B.send('Ready',''); await until(()=>A.seen.includes('ReadyChanged')||B.seen.includes('ReadyChanged'))
await wait(300); A.send('StartGame',''); await until(()=>A.reqs.length>0,10000)
const pre=A.reqs[A.reqs.length-1]
console.log(`PRE-DROP request: ${pre?.command} timeout=${pre?.timeout}s timestamp=${pre?.timestamp}`)
const waitSec=4
console.log(`--- waiting ${waitSec}s (timer counting down) then refresh ---`)
await wait(waitSec*1000)
A.ws.close(); await wait(700)
const A2=client(`tsA_${stamp}`,aUuid,'A2')
await until(()=>A2.reqs.length>0||A2.seen.includes('AskForGeneral'),8000)
await wait(1500)
const post=A2.reqs.find(r=>r.command===pre?.command) || A2.reqs[A2.reqs.length-1]
console.log(`POST-RECONNECT request: ${post?.command} timeout=${post?.timeout}s timestamp=${post?.timestamp}`)
if(pre?.timestamp && post?.timestamp){
  const drift = post.timestamp - pre.timestamp
  console.log(`\nRESULT: timestamp drift = ${drift}ms (waited ~${(waitSec*1000)+700}ms during the gap)`)
  if(Math.abs(drift) < 500) console.log('→ SERVER PRESERVED the original window: client can sync TRUE remaining time. ✅')
  else console.log(`→ SERVER RESET the timestamp (+${drift}ms): the request window RESTARTED on reconnect. Client bar should also restart (which our absolute-deadline math does, since it uses the NEW timestamp). So they STAY in sync either way — the question is just whether real remaining time was reset server-side.`)
}else{
  console.log('RESULT: could not capture both timestamps (post may have no AskFor request if AI/timeout consumed it).')
}
try{A2.ws.close();B.ws.close()}catch{}
bridge.close().then(()=>process.exit(0))
