import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAppServer} from '../server.mjs';
import {launchBrowser} from './browser-driver.mjs';
const output=new URL('../receiving/continuous-baseline/',import.meta.url);await mkdir(output,{recursive:true});
const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let b;
const result={sourceSha256:createHash('sha256').update(await readFile(new URL('../src/app.js',import.meta.url))).digest('hex')};
try{
 b=await launchBrowser({url:'http://127.0.0.1:'+server.address().port+'/',screenshotDir:output.pathname});
 await b.click('[data-pack="switch-select"]');await b.evaluate('document.querySelector("#toggle-scan").focus();true');
 const enter={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'};
 const read=()=>b.evaluate('({position:document.querySelector(".track").getAttribute("aria-label"),focus:document.activeElement.id})');
 await b.send('Input.dispatchKeyEvent',{...enter,type:'keyDown'});result.afterStart=await read();
 await b.send('Input.dispatchKeyEvent',{...enter,type:'keyDown',autoRepeat:true});result.afterRepeat=await read();
 await b.send('Input.dispatchKeyEvent',{...enter,type:'keyUp'});
 result.unintendedMove=result.afterStart.position!==result.afterRepeat.position;result.errors=b.errors;
 await writeFile(new URL('receipt.json',output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}finally{await b?.close();await new Promise(r=>server.close(r));}
