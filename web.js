'use strict';
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { generatePairingCode } = require('./lib/sessionManager');
const app = express();
const PORT = Number(process.env.PORT || 10000);
const BOT_PORT = Number(process.env.BOT_INTERNAL_PORT || 10001);
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 8;
const requests = new Map();
const pendingNumbers = new Map();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');next()});
app.get('/', (_req,res)=>res.redirect('/pair'));
app.get('/pair', (_req,res)=>res.sendFile(path.join(__dirname,'public','pair.html')));
app.get('/healthz', (_req,res)=>res.json({status:'ok',service:'queen-riam-pair'}));
app.post('/api/pair', async (req,res)=>{
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
  const now=Date.now(); let bucket=requests.get(ip)||[]; bucket=bucket.filter(t=>now-t<WINDOW_MS);
  if(bucket.length>=MAX_PER_IP){return res.status(429).json({error:'Too many requests. Please wait a few minutes and try again.'})}
  const number=String(req.body?.number||'').replace(/\D/g,'');
  if(number.length<8||number.length>15)return res.status(400).json({error:'Enter a valid international phone number (8–15 digits).'});
  const last=pendingNumbers.get(number)||0;
  if(now-last<90_000)return res.status(429).json({error:'A code was recently requested for this number. Wait 90 seconds before trying again.'});
  bucket.push(now);requests.set(ip,bucket);pendingNumbers.set(number,now);
  try{
    const raw=await generatePairingCode(number);
    if(!raw){return res.json({alreadyLinked:true})}
    const code=String(raw).replace(/-/g,'').toUpperCase();
    if(!/^[A-Z0-9]{8}$/.test(code))throw new Error('WhatsApp returned an unexpected pairing code format.');
    return res.json({code});
  }catch(err){pendingNumbers.delete(number);console.error('[public-pair] generation failed:',err.message);return res.status(500).json({error:err.message==='ALREADY_ACTIVE'?'A pairing request is already active for this number.':'Unable to generate a pairing code right now. Please try again shortly.'})}
});
app.use((_req,res)=>res.status(404).send('Not found'));
const botEnv={...process.env,PORT:String(BOT_PORT)};
const bot=spawn(process.execPath,[path.join(__dirname,'index.js')],{cwd:__dirname,env:botEnv,stdio:'inherit'});
bot.on('exit',(code,signal)=>{console.error(`[bot] process exited (code=${code}, signal=${signal})`);if(code!==0)process.exitCode=code||1});
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`[public-pair] listening on 0.0.0.0:${PORT}`));
function shutdown(){server.close(()=>{});bot.kill('SIGTERM');setTimeout(()=>process.exit(0),5000).unref()}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
