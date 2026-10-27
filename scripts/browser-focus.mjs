import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from './browser-driver.mjs';
const url=process.argv[2],out=process.argv[3]||'receiving/focus';
if(!url)throw new Error('Usage: node scripts/browser-focus.mjs LOOPBACK_URL [OUTPUT_DIR]');
await mkdir(out,{recursive:true});
const receipt={url,checks:[],limitations:['Authored browser receiving; no screen-reader or hardware-switch usability claim.']};
const b=await launchBrowser({url,width:320,height:800,screenshotDir:out});
const focus=()=>b.evaluate(`(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return {id:e.id,top:r.top,bottom:r.bottom,viewport:innerHeight,scrollY,visible:r.top>=0&&r.bottom<=innerHeight}})()`);
function check(name,value,detail){receipt.checks.push({name,passed:!!value,detail});assert.ok(value,name);}
try{
 await b.click('[data-game="pocket-signals"]');
 await b.key('Enter');
 const revealed=await b.evaluate(`({hand:!!document.querySelector('[data-testid="private-hand"]'),cards:document.querySelectorAll('.playing-card').length})`);
 check('Keyboard reveals two private cards',revealed.hand&&revealed.cards===2,revealed);
 await b.key('Tab');await b.key('Tab');await b.key('Enter');
 const handoff=await b.evaluate(`({hand:!!document.querySelector('[data-testid="private-hand"]'),focus:document.activeElement.id,axLabels:[...document.querySelectorAll('.playing-card')].map(e=>e.getAttribute('aria-label'))})`);
 check('Keyboard commitment covers cards and focuses next handoff',!handoff.hand&&handoff.focus==='reveal-hand'&&handoff.axLabels.length===0,handoff);
 await b.click('[data-pack="switch-select"]');
 const pocketFocus=await focus();
 check('Access pack activation reveals its focused handoff at 320px',pocketFocus.id==='reveal-hand'&&pocketFocus.visible,pocketFocus);
 await b.screenshot('focused-handoff-320.png');
 await b.click('[data-game="beacon-steps"]');
 await b.click('[data-pack="shape-text"]');
 const beaconFocus=await focus();
 check('Ordinary access pack activation reveals its focused table',beaconFocus.id==='table-title'&&beaconFocus.visible,beaconFocus);
 await b.click('[data-pack="switch-select"]');
 await b.click('#toggle-scan');
 const before=await b.evaluate(`(()=>{window.scrollTo({top:0,behavior:'instant'});return {scrollY,selected:document.querySelector('[data-scan-index].selected')?.dataset.scanIndex,focus:document.activeElement.id}})()`);
 let after=before;
 const deadline=Date.now()+5000;
 while(after.selected===before.selected&&Date.now()<deadline){
  await delay(100);
  after=await b.evaluate(`({scrollY,selected:document.querySelector('[data-scan-index].selected')?.dataset.scanIndex,focus:document.activeElement.id})`);
 }
 check('Timer advances choices without scrolling or moving focus',before.selected!==after.selected&&before.scrollY===after.scrollY&&before.focus===after.focus,{before,after});
 check('No browser errors',b.errors.length===0,b.errors);
 receipt.passed=true;
}catch(error){receipt.passed=false;receipt.error=String(error.stack||error);process.exitCode=1;}
finally{await b.close();await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt,null,2));
