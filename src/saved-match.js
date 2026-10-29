import {stateKey} from './games.js';
import {getCatalog} from './catalog.js';

export const SAVED_MATCH_KEY='open-table.saved-match.v1';
export const SAVED_MATCH_SCHEMA='open-table.saved-match.v1';
const MAX_RECORD_LENGTH=65536;
const FIELDS=['schema','gameId','rulesetPin','savedAt','adapter','state'];
const ADAPTERS=new Set(['shape-text','switch-select']);
function fail(message,code){const error=new Error(message);error.code=code;throw error;}
function plainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
function validateRecord(record){
 if(!plainObject(record)||Object.keys(record).length!==FIELDS.length||FIELDS.some(key=>!Object.hasOwn(record,key)))fail('The saved match has an invalid format.','INVALID_RECORD');
 if(record.schema!==SAVED_MATCH_SCHEMA)fail('This saved-match version is not supported.','UNSUPPORTED_VERSION');
 if(typeof record.gameId!=='string')fail('The saved match has an invalid game.','INVALID_GAME');
 let catalog;try{catalog=getCatalog(record.gameId);}catch{fail('The saved match uses an unknown game.','INVALID_GAME');}
 if(typeof record.rulesetPin!=='string'||record.rulesetPin!==catalog.rulesetPin)fail('This save belongs to a different Open Table build. It has been kept; try the copy that created it.','RULESET_MISMATCH');
 if(typeof record.savedAt!=='string')fail('The saved match has an invalid save time.','INVALID_TIME');
 const date=new Date(record.savedAt);
 if(!Number.isFinite(date.getTime())||date.toISOString()!==record.savedAt)fail('The saved match has an invalid save time.','INVALID_TIME');
 if(!ADAPTERS.has(record.adapter))fail('The saved match has an unsupported adapter.','INVALID_ADAPTER');
 if(!plainObject(record.state)||record.state.game!==record.gameId)fail('The saved state does not match its game.','INVALID_STATE');
 let state;
 try{
  // stateKey invokes the authored game validator. Canonical parsing detaches nested state.
  state=JSON.parse(stateKey(record.state));
 }catch{fail('The saved match contains an invalid game state.','INVALID_STATE');}
 return {schema:SAVED_MATCH_SCHEMA,gameId:record.gameId,rulesetPin:record.rulesetPin,savedAt:record.savedAt,adapter:record.adapter,state};
}
export function encodeSavedMatch({gameId,state,adapter},savedAt=new Date().toISOString()){
 let catalog;try{catalog=getCatalog(gameId);}catch{fail('The match uses an unknown game.','INVALID_GAME');}
 const raw=JSON.stringify(validateRecord({schema:SAVED_MATCH_SCHEMA,gameId,rulesetPin:catalog.rulesetPin,savedAt,adapter,state}));
 if(raw.length>MAX_RECORD_LENGTH)fail('The saved match is too large.','RECORD_TOO_LARGE');
 return raw;
}
export function decodeSavedMatch(raw){
 if(typeof raw!=='string')fail('The saved match has an invalid format.','INVALID_RECORD');
 if(raw.length>MAX_RECORD_LENGTH)fail('The saved match is too large.','RECORD_TOO_LARGE');
 let parsed;try{parsed=JSON.parse(raw);}catch{fail('The saved match could not be read.','INVALID_JSON');}
 return validateRecord(parsed);
}
export function inspectSavedMatch(storage){
 let raw;
 try{raw=storage.getItem(SAVED_MATCH_KEY);if(raw!==null&&typeof raw!=='string')throw new Error('Invalid storage response');}
 catch{return {status:'unavailable',raw:null,message:'Saved-match storage is unavailable in this browser.'};}
 if(raw===null)return {status:'empty',raw:null};
 try{return {status:'ready',raw,record:decodeSavedMatch(raw)};}
 catch(error){return {status:'invalid',raw,message:error.message};}
}
function checkExpected(storage,expectedRaw){
 if(expectedRaw!==null&&typeof expectedRaw!=='string')fail('Read the saved-match slot before changing it.','EXPECTED_RECORD_REQUIRED');
 let current;
 try{current=storage.getItem(SAVED_MATCH_KEY);}
 catch{fail('Saved-match storage could not be read. No change was attempted.','STORAGE_UNAVAILABLE');}
 if(current!==expectedRaw)fail('The saved match changed. Review the current save before trying again.','RECORD_CHANGED');
}
export function saveStoredMatch(storage,match,expectedRaw){
 const raw=encodeSavedMatch(match);
 checkExpected(storage,expectedRaw);
 try{storage.setItem(SAVED_MATCH_KEY,raw);}
 catch{fail('The browser refused to save this match. The save was not confirmed.','WRITE_REFUSED');}
 let observed;
 try{observed=storage.getItem(SAVED_MATCH_KEY);}
 catch{fail('Saving could not be verified. Check the saved-match slot before trying again.','SAVE_UNVERIFIED');}
 if(observed!==raw)fail('The saved-match slot changed or the save was not retained. Saving could not be verified.','SAVE_UNVERIFIED');
 return decodeSavedMatch(raw);
}
export function clearStoredMatch(storage,expectedRaw){
 checkExpected(storage,expectedRaw);
 try{storage.removeItem(SAVED_MATCH_KEY);}
 catch{fail('The browser refused to forget the saved match. Forgetting was not confirmed.','REMOVE_REFUSED');}
 let observed;
 try{observed=storage.getItem(SAVED_MATCH_KEY);}
 catch{fail('Forgetting was attempted but could not be verified. Check the saved-match slot before trying again.','CLEAR_UNVERIFIED');}
 if(observed!==null)fail('The saved-match slot is not empty. Forgetting could not be verified.','CLEAR_UNVERIFIED');
 return {status:'empty',raw:null};
}
