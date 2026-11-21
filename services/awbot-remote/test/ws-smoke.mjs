import WebSocket from 'ws'
import { createControlFrame, decodeControlFrame } from '../protocol/dist/index.js'
import { randomBytes } from 'node:crypto'
const base='http://127.0.0.1:18082'
const key=()=>randomBytes(32).toString('base64url')
const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:process.env.SMOKE_ACCOUNT||'demo',password:process.env.SMOKE_PASSWORD||'smoke-password-123'})}).then(r=>r.json())
const reg=await fetch(base+'/api/v1/devices/register',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+login.token},body:JSON.stringify({v:1,device:{deviceId:'019a0000-0000-7000-8000-000000000021',name:'ws-host',role:'host',platform:'desktop',clientVersion:'smoke',identityKey:key()}})}).then(r=>r.json())
const ws=new WebSocket('ws://127.0.0.1:18082/ws/v1/connect')
ws.on('open',()=>ws.send(JSON.stringify(createControlFrame('hello',{role:'host',deviceId:'019a0000-0000-7000-8000-000000000021',accessToken:reg.accessToken,protocols:[1],capabilities:['transport.relay']}))))
ws.on('message',(data)=>{const f=decodeControlFrame(data.toString()); console.log('frame',f.type,JSON.stringify(f.payload)); if(f.type==='hello.ack'){console.log('ack ok');ws.close();process.exit(0)}})
ws.on('error',(e)=>{console.error('ws error',e.message);process.exit(1)})
setTimeout(()=>{console.error('timeout');process.exit(1)},5000)
