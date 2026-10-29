import assert from 'node:assert/strict';
import {resolve,dirname} from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launchBrowser} from './browser-driver.mjs';
const file=resolve(process.argv[2]),out=resolve(process.argv[3]);await mkdir(out,{recursive:true});
const initial=await readFile(file),rows=[],within=r=>r.top>=0&&r.bottom<=r.viewport;
const rect=selector=>'(()=>{const n=document.querySelector('+JSON.stringify(selector)+'),r=n?.getBoundingClientRect();return {text:n?.textContent,top:r?.top,bottom:r?.bottom,width:r?.width,height:r?.height,viewport:innerHeight}})()';
const focus='(()=>{const n=document.activeElement,r=n?.getBoundingClientRect(),s=n?getComputedStyle(n):null;return {id:n?.id,choice:n?.getAttribute("data-choice"),top:r?.top,bottom:r?.bottom,viewport:innerHeight,focusVisible:n?.matches(":focus-visible"),outlineExtent:s&&s.outlineStyle!=="none"?Math.max(0,parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset)):0}})()';
for(const [width,height] of [[1440,1000],[375,812],[320,640]]){
 const b=await launchBrowser({filePath:file,artifactRoot:dirname(file),offline:true,width,height,screenshotDir:out}),row={width,height,checks:[],focus:[]};
 try{
  row.first={title:await b.evaluate(rect('#table-title')),turn:await b.evaluate(rect('.player-tag')),board:await b.evaluate(rect('.track')),choice1:await b.evaluate(rect('[data-choice="0"]')),choice2:await b.evaluate(rect('[data-choice="1"]'))};
  for(const [name,r] of Object.entries(row.first))assert.ok(within(r),'First-use '+name+' fully visible at '+width);
  for(const key of ['choice1','choice2'])assert.ok(row.first[key].height>=44&&row.first[key].width>=44);
  assert.equal(await b.evaluate('!!document.querySelector(".play-shell .hero")'),false);
  assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/at 0$/);
  await b.screenshot(width+'-first.png');row.checks.push('Cold opening puts goal, current player, entire path and both real actions in view without a jump button');
  for(let i=0;i<20&&(await b.evaluate(focus)).choice!=='0';i++)await b.key('Tab');
  assert.equal((await b.evaluate(focus)).choice,'0');assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/at 0$/);
  row.checks.push('Ordinary Tab navigation reaches a real action without making a move');
  const enter={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'};
  await b.send('Input.dispatchKeyEvent',{...enter,type:'keyDown'});for(let i=0;i<5;i++)await b.send('Input.dispatchKeyEvent',{...enter,type:'keyDown',autoRepeat:true});await b.send('Input.dispatchKeyEvent',{...enter,type:'keyUp'});
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/at 1$/);row.checks.push('Held Enter makes one move only, not later turns');
  await b.screenshot(width+'-next-turn.png');
  for(let i=1;i<=6;i++){
   if(i>1)await b.key('Enter');const f=await b.evaluate(focus);row.focus.push(f);assert.equal(f.choice,'0');assert.ok(within(f));
   const turn=await b.evaluate(rect('[aria-label="Adapted choices"] h3'));assert.ok(within(turn));assert.match(turn.text,new RegExp('^Player '+((i%2)+1)+' · '));
   assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),new RegExp('at '+i+'$'));
  }row.checks.push('Six turns preserve visible next action, current player and exact progress');
  await b.key('Enter');assert.equal((await b.evaluate(focus)).id,'new-game');row.checks.push('Terminal outcome routes to Play again');
  await b.click('#new-game');assert.equal(await b.evaluate('document.querySelector(".choice-explanation").open'),false);
  await b.click('.choice-explanation > summary');assert.equal(await b.evaluate('document.querySelector(".choice-explanation").open'),true);
  assert.equal(await b.evaluate('document.querySelectorAll(".choice-explanation button, .choice-explanation [role=button]").length'),0);
  assert.equal(await b.evaluate('document.querySelectorAll(".choice-explanation .original-actions li").length'),2);
  assert.match(await b.evaluate('document.querySelector(".choice-explanation").textContent'),/explanation—not extra controls/);
  assert.equal(await b.evaluate('document.querySelectorAll("[data-choice]").length'),2);
  assert.ok(await b.evaluate('!!document.querySelector(".about-table > summary")'));
  row.checks.push('Original choices remain available in a closed-by-default explanatory disclosure, never a second control set');
  await b.click('[data-pack="switch-select"]');
  for(let i=0;i<20&&(await b.evaluate(focus)).id!=='confirm-choice';i++)await b.key('Tab');
  assert.equal((await b.evaluate(focus)).id,'confirm-choice');await b.key('Enter');assert.equal((await b.evaluate(focus)).id,'confirm-choice');row.manualScanFocus=await b.evaluate(focus);await b.screenshot(width+'-manual-scan.png');assert.equal(row.manualScanFocus.focusVisible,true);assert.ok(row.manualScanFocus.outlineExtent>=3);assert.ok(row.manualScanFocus.top>=row.manualScanFocus.outlineExtent&&row.manualScanFocus.bottom<=row.manualScanFocus.viewport-row.manualScanFocus.outlineExtent,'Entire confirmation and its actual computed focus outline stay visible');
  row.checks.push('Manual scanning keeps explicit confirmation reachable');
  await b.click('[data-game="pocket-signals"]');assert.equal(await b.evaluate('!!document.querySelector("[data-testid=private-hand]")'),false);assert.equal(await b.evaluate('!!document.querySelector(".choice-explanation")'),false);
  await b.click('#reveal-hand');await b.click('#confirm-choice');assert.equal(await b.evaluate('!!document.querySelector("[data-testid=private-hand]")'),false);assert.equal(await b.evaluate('!!document.querySelector(".choice-explanation")'),false);assert.equal((await b.evaluate(focus)).id,'reveal-hand');
  row.checks.push('Pocket commitment clears private cards and explanatory choices before handoff');
  await b.click('#workshop-tab');assert.ok(await b.evaluate('!!document.querySelector(".hero")'));assert.equal(await b.evaluate('!!document.querySelector(".play-shell")'),false);row.checks.push('Workshop retains its separate explanatory authoring journey');
  await b.click('#play-tab');await b.click('#one-key-entry');assert.ok(await b.evaluate('!!document.querySelector(".one-key-shell")'));assert.equal(await b.evaluate('!!document.querySelector(".play-shell,.about-table,.choice-explanation")'),false);row.checks.push('One-key keeps its separate compact setup and play layout');
  assert.deepEqual(b.errors,[]);row.errors=[...b.errors];row.requests=[...b.requests];row.ok=true;
 }catch(e){row.ok=false;row.failure=e.stack||String(e);process.exitCode=1;}finally{await b.close();rows.push(row);}
}
const receipt={schema:'open-table.play-first-receiving.v1',sourceSHA256:createHash('sha256').update(initial).digest('hex'),unchanged:Buffer.compare(initial,await readFile(file))===0,rows,limits:['Normal sandboxed Chrome UI and viewport qualification, not human playtesting or assistive-device certification','Actual pixels require separate inspection','No provider inference or exported demo video']};await writeFile(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
