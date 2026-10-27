import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createAppServer} from '../server.mjs';
import {launchBrowser} from './browser-driver.mjs';
const dir=new URL('../receiving/browser-initial/',import.meta.url);await mkdir(dir,{recursive:true});
const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const result={};
try{
 browser=await launchBrowser({url:'http://127.0.0.1:'+server.address().port+'/',screenshotDir:dir.pathname});
 assert.equal(await browser.evaluate('document.querySelector("#table-title")?.textContent'),'Beacon Steps');
 result.desktop=await browser.screenshot('desktop-initial.png');
 await browser.click('[data-game="pocket-signals"]');
 await browser.click('[data-pack="switch-select"]');
 await browser.click('#reveal-hand');
 await browser.evaluate('document.querySelector("#confirm-choice").focus();true');
 const enter={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'};
 await browser.send('Input.dispatchKeyEvent',{...enter,type:'keyDown'});
 result.afterCommit=await browser.evaluate('({covered:!!document.querySelector("#reveal-hand"),privateVisible:!!document.querySelector("#private-title"),focus:document.activeElement.id})');
 await browser.send('Input.dispatchKeyEvent',{...enter,type:'keyDown',autoRepeat:true});
 result.afterRepeatedEnter=await browser.evaluate('({covered:!!document.querySelector("#reveal-hand"),privateVisible:!!document.querySelector("#private-title"),focus:document.activeElement.id})');
 await browser.send('Input.dispatchKeyEvent',{...enter,type:'keyUp'});
 result.observedHandoffFailure=result.afterCommit.covered&&result.afterRepeatedEnter.privateVisible;
 result.errors=browser.errors;
 await writeFile(new URL('receipt.json',dir),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
 assert.equal(result.errors.filter(x=>x.type==='runtime').length,0);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
