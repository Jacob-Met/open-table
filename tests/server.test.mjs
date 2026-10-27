import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.mjs';
test('real HTTP entry point serves all transitive browser imports and denies unrelated files',async()=>{
 const server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);
  const html=await page.text();assert.match(html,/src="\/src\/app.js"/);assert.match(html,/href="\/styles.css"/);
  const todo=['/src/app.js'],seen=new Set();
  while(todo.length){
   const path=todo.shift();if(seen.has(path))continue;seen.add(path);
   const res=await fetch(base+path);assert.equal(res.status,200,path);assert.match(res.headers.get('content-type'),/javascript/);
   const source=await res.text();
   for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))todo.push(new URL(match[1],base+path).pathname);
  }
  assert.ok(seen.has('/src/ruleset-pins.js'));assert.ok(seen.has('/src/games.js'));assert.ok(seen.has('/src/pack.js'));
  assert.equal((await fetch(base+'/styles.css')).status,200);
  for(const path of ['/.env','/.git/config','/package.json','/src/../server.mjs','/docs/RECOVERY.json'])assert.equal((await fetch(base+path)).status,404,path);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
