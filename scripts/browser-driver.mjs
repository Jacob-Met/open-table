import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {basename,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
const HOSTS=new Set(['127.0.0.1','localhost','[::1]']);
function loopback(value,protocols=['http:','https:','ws:','wss:']){
 try{const u=new URL(value);return protocols.includes(u.protocol)&&HOSTS.has(u.hostname)&&!u.username&&!u.password;}catch{return false;}
}
const KEYS={Enter:['Enter',13],Tab:['Tab',9],Escape:['Escape',27],Space:[' ',32],' ':[' ',32],Backspace:['Backspace',8],Delete:['Delete',46],ArrowLeft:['ArrowLeft',37],ArrowUp:['ArrowUp',38],ArrowRight:['ArrowRight',39],ArrowDown:['ArrowDown',40],Home:['Home',36],End:['End',35],PageUp:['PageUp',33],PageDown:['PageDown',34]};
export async function launchBrowser({url,filePath,artifactRoot,hash='',offline=false,width=1440,height=1000,profileDir,screenshotDir='receiving/browser'}={}){
 if(typeof WebSocket!=='function')throw new Error('Node 22 global WebSocket is required');
 const fileMode=filePath!==undefined;
 let targetURL;
 if(fileMode){
  if(url!==undefined||offline!==true||typeof filePath!=='string'||!isAbsolute(filePath)||typeof artifactRoot!=='string'||!isAbsolute(artifactRoot)||typeof hash!=='string')throw new Error('File receiving requires one absolute filePath, absolute artifactRoot, and offline:true.');
  const actual=await realpath(filePath),allowedRoot=await realpath(artifactRoot),inside=relative(allowedRoot,actual);
  if(!inside||inside==='..'||inside.startsWith('..'+sep)||isAbsolute(inside)||!/\.(?:html|htm)$/i.test(actual)||!(await stat(actual)).isFile()||!(await stat(allowedRoot)).isDirectory())throw new Error('Receiving file must be a regular HTML file inside artifactRoot.');
  const entry=pathToFileURL(actual);entry.hash=hash;targetURL=entry.href;
 }else{
  if(!loopback(url,['http:','https:']))throw new Error('Receiving URL must use loopback HTTP(S)');
  if(offline)throw new Error('offline:true is reserved for explicit file receiving.');
  targetURL=new URL(url).href;
 }
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0))throw new Error('Invalid viewport');
 const fileIdentity=new URL(targetURL);fileIdentity.hash='';
 function permittedRequest(value){
  if(/^(?:data|blob):/.test(value))return true;
  if(!fileMode)return loopback(value)||/^about:/.test(value);
  if(value==='about:blank')return true;
  try{const request=new URL(value);request.hash='';return request.protocol==='file:'&&request.href===fileIdentity.href;}catch{return false;}
 }
 const temporary=profileDir===undefined;
 const profile=temporary?await mkdtemp(join(tmpdir(),'open-table-chrome-')):resolve(profileDir);
 await mkdir(profile,{recursive:true});if((await readdir(profile)).length)throw new Error('Profile must be empty; existing profiles are preserved');
 const shots=resolve(screenshotDir);await mkdir(shots,{recursive:true});
 let child,socket,spawnError,stderr='',sequence=0,closing;
 const pending=new Map(),errors=[],requests=[];
 const exited=()=>!child||spawnError||child.exitCode!==null||child.signalCode!==null;
 function rejectPending(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();}
 function call(method,params={},timeout=10000){
  return new Promise((resolveRequest,reject)=>{
   if(socket?.readyState!==WebSocket.OPEN){reject(new Error('CDP not open: '+method));return;}
   const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},timeout);
   pending.set(id,{resolve:resolveRequest,reject,timer,method});
   try{socket.send(JSON.stringify({id,method,params}));}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
  });
 }
 async function until(read,timeout,label){
  const deadline=Date.now()+timeout;let lastError;
  while(Date.now()<deadline){
   if(exited())throw new Error('Chrome exited during '+label+': '+(spawnError?.message||stderr));
   try{const value=await read();if(value)return value;}catch(e){lastError=e;}
   await delay(75);
  }
  throw new Error(label+' timed out'+(lastError?': '+lastError.message:''));
 }
 async function evaluate(expression){
  if(typeof expression!=='string')throw new Error('Expression must be a string');
  const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  if(Object.hasOwn(r.result,'unserializableValue'))throw new Error('Non-JSON evaluation result');
  return r.result.value;
 }
 async function close(){
  if(closing)return closing;
  closing=(async()=>{
   if(socket?.readyState===WebSocket.OPEN)await call('Browser.close',{},1500).catch(()=>{});
   let deadline=Date.now()+1500;while(!exited()&&Date.now()<deadline)await delay(50);
   if(!exited())child.kill('SIGTERM');
   deadline=Date.now()+1000;while(!exited()&&Date.now()<deadline)await delay(50);
   if(!exited())child.kill('SIGKILL');
   deadline=Date.now()+1000;while(!exited()&&Date.now()<deadline)await delay(50);
   try{socket?.close();}catch{}rejectPending(new Error('Browser driver closed'));
   if(temporary&&exited())await rm(profile,{recursive:true,force:true});
   if(!exited())throw new Error('Owned Chrome process did not exit');
  })();return closing;
 }
 try{
  const args=['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--window-size='+width+','+height,
   '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-default-apps',
   '--disable-quic','--disable-background-timer-throttling','--disable-renderer-backgrounding',
   '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1;localhost;[::1]','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE [::1]','about:blank'];
  if(process.getuid?.()===0)args.unshift('--no-sandbox');
  child=spawn('/usr/local/bin/google-chrome',args,{stdio:['ignore','ignore','pipe']});
  child.on('error',e=>spawnError=e);child.stderr.on('data',chunk=>stderr=(stderr+chunk).slice(-8192));
  const port=await until(async()=>{const text=await readFile(join(profile,'DevToolsActivePort'),'utf8'),n=Number(text.split(/\r?\n/,1)[0]);return Number.isInteger(n)&&n>0&&n<=65535?n:false;},20000,'DevToolsActivePort');
  const target=await until(async()=>{
   const res=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)});
   if(!res.ok)throw new Error('DevTools HTTP '+res.status);
   return (await res.json()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl);
  },5000,'page discovery');
  const wsURL=new URL(target.webSocketDebuggerUrl);
  if(!loopback(wsURL.href)||Number(wsURL.port)!==port)throw new Error('Unexpected DevTools owner');
  socket=new WebSocket(wsURL.href);
  socket.addEventListener('error',()=>errors.push({type:'transport',message:'DevTools WebSocket error'}));
  socket.addEventListener('close',()=>rejectPending(new Error('DevTools WebSocket closed')));
  socket.addEventListener('message',event=>{
   let m;try{m=JSON.parse(event.data);}catch(e){errors.push({type:'transport',message:e.message});rejectPending(e);return;}
   if(m.id!==undefined){
    const p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);
    if(m.error)p.reject(new Error(p.method+': '+m.error.message));else p.resolve(m.result||{});return;
   }
   const d=m.params||{};
   if(m.method==='Network.requestWillBeSent')requests.push({kind:'request',url:d.request.url,type:d.type,frameId:d.frameId,initiatorType:d.initiator?.type});
   else if(m.method==='Network.webSocketCreated')requests.push({kind:'websocket',url:d.url});
   else if(m.method==='Page.frameNavigated')requests.push({kind:'frame',url:d.frame.url,frameId:d.frame.id});
   if(m.method==='Runtime.exceptionThrown')errors.push({type:'runtime',message:d.exceptionDetails.exception?.description||d.exceptionDetails.text});
   else if(m.method==='Runtime.consoleAPICalled'&&d.type==='error')errors.push({type:'console',message:d.args.map(a=>a.value||a.description).join(' ')});
   else if(m.method==='Fetch.requestPaused'){
    const allowed=permittedRequest(d.request.url);
    if(!allowed){requests.push({kind:'blocked',url:d.request.url,type:d.resourceType,frameId:d.frameId});errors.push({type:'blocked-network',url:d.request.url});}
    call(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:d.requestId}:{requestId:d.requestId,errorReason:'BlockedByClient'}).catch(e=>errors.push({type:'interception',message:e.message}));
   }
  });
  await until(()=>socket.readyState===WebSocket.OPEN,5000,'CDP socket');
  await Promise.all([call('Runtime.enable'),call('Page.enable'),call('Accessibility.enable'),call('Network.enable'),call('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]})]);
  if(fileMode)await call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  const nav=await call('Page.navigate',{url:targetURL});if(nav.errorText)throw new Error(nav.errorText);
  await until(async()=>{const s=await evaluate('({ready:document.readyState,href:location.href})');return s.ready==='complete'&&s.href===targetURL;},15000,'document load');
  return {errors,requests,entryURL:targetURL,offline:fileMode,pid:child.pid,port,evaluate,send:call,
   async click(selector){
    const expression='(async()=>{const all=document.querySelectorAll('+JSON.stringify(selector)+');if(all.length!==1)throw new Error("Click matches "+all.length);const e=all[0];if(e.disabled||e.getAttribute("aria-disabled")==="true")throw new Error("Disabled click target");e.scrollIntoView({block:"center",inline:"center",behavior:"instant"});await new Promise(r=>requestAnimationFrame(r));const b=e.getBoundingClientRect();if(!(b.width>0&&b.height>0))throw new Error("No rendered area");const x=Math.max(1,Math.min(innerWidth-1,b.x+b.width/2)),y=Math.max(1,Math.min(innerHeight-1,b.y+b.height/2));if(!e.contains(document.elementFromPoint(x,y)))throw new Error("Obscured click target");return {x,y};})()';
    const point=await evaluate(expression);
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
   },
   async key(input){
    const parts=String(input).split('+'),base=parts.pop(),bits={Alt:1,Control:2,Ctrl:2,Meta:4,Shift:8};let modifiers=0;
    for(const part of parts){if(!bits[part])throw new Error('Unknown modifier');modifiers|=bits[part];}
    const special=KEYS[base];if(!special&&!/^[A-Za-z0-9]$/.test(base))throw new Error('Unsupported key');
    const key=special?.[0]||((modifiers&8)?base.toUpperCase():base);
    const code=key===' '?'Space':special?base:/^[0-9]$/.test(base)?'Digit'+base:'Key'+base.toUpperCase();
    const params={key,code,windowsVirtualKeyCode:special?.[1]||base.toUpperCase().charCodeAt(0),modifiers};
    const text=(modifiers&7)?'':key==='Enter'?'\r':key.length===1?key:'';
    await call('Input.dispatchKeyEvent',{...params,type:text?'keyDown':'rawKeyDown',...(text?{text,unmodifiedText:text}:{})});
    await call('Input.dispatchKeyEvent',{...params,type:'keyUp'});
   },
   async screenshot(filename){
    if(basename(filename)!==filename||!filename.endsWith('.png'))throw new Error('Simple PNG filename required');
    await evaluate('(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;})()');
    const result=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    const path=join(shots,filename);await writeFile(path,Buffer.from(result.data,'base64'));return path;
   },
   async axTree(){return (await call('Accessibility.getFullAXTree')).nodes;},
   close
  };
 }catch(error){await close().catch(e=>error.message+='; cleanup: '+e.message);throw error;}
}
