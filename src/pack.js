import {getCatalog} from './catalog.js';
import {checkAdaptation} from './adaptations.js';
const SCHEMA='open-table.adaptation-pack.v1',MODES=new Set(['shape-text','switch-select']);
const FIELDS=['schema','gameId','rulesetPin','classification','adapter'];
function candidate(gameId,adapter){
 const catalog=getCatalog(gameId);
 if(!MODES.has(adapter)||!Object.prototype.hasOwnProperty.call(catalog.adapters,adapter))throw new Error('This adapter is not approved for adaptation packs.');
 return catalog;
}
function currentCheck(gameId,adapter){
 const check=checkAdaptation(gameId,adapter);
 if(!check||check.gameId!==gameId||check.ok!==true||check.complete!==true||check.verdict!=='equivalent')
  throw new Error('The current independent finite-game check did not qualify this adaptation. Nothing was activated.');
 return {ok:true,complete:true,verdict:'equivalent',gameId,states:check.states,transitions:check.transitions,initialStates:check.initialStates,scope:check.scope};
}
export function createPack(gameId,adapter){
 const catalog=candidate(gameId,adapter);currentCheck(gameId,adapter);
 return JSON.stringify({schema:SCHEMA,gameId,rulesetPin:catalog.rulesetPin,classification:'equivalence-candidate',adapter},null,2);
}
export function importPack(jsonText){
 if(typeof jsonText!=='string'||jsonText.length>8192)throw new Error('Expected an adaptation-pack JSON document of at most 8192 characters.');
 let pack;try{pack=JSON.parse(jsonText);}catch{throw new Error('The adaptation pack is not valid JSON.');}
 if(!pack||typeof pack!=='object'||Array.isArray(pack))throw new Error('The adaptation pack must be an object.');
 for(const field of Object.keys(pack))if(!FIELDS.includes(field))throw new Error('Unapproved pack field: '+field+'. Live state and imported evidence are not accepted.');
 for(const field of FIELDS)if(!Object.prototype.hasOwnProperty.call(pack,field))throw new Error('Missing pack field: '+field+'.');
 if(pack.schema!==SCHEMA||pack.classification!=='equivalence-candidate')throw new Error('Unsupported pack schema or unapproved variant. Variants require a separately approved game and source binding.');
 const catalog=candidate(pack.gameId,pack.adapter);
 if(pack.rulesetPin!==catalog.rulesetPin)throw new Error('This pack targets stale or different approved rules/adapters. Nothing was activated.');
 return {gameId:pack.gameId,adapter:pack.adapter,check:currentCheck(pack.gameId,pack.adapter)};
}
