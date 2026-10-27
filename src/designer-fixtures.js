import {initialStates,step} from './games.js';
export const DESIGNER_FIXTURE_IDS=Object.freeze(['ot-fixture-001','ot-fixture-002','ot-fixture-003','ot-fixture-004']);
const advance=(player,steps)=>({type:'advance',player,steps}),commit=(player,card)=>({type:'commit',player,card});
function run(initialState,trace){return {initialState:structuredClone(initialState),trace:structuredClone(trace),state:trace.reduce((s,a)=>step(s,a),structuredClone(initialState))};}
// Synthetic designer inspector only. Never accepts a live game or deal identifier.
export function resolveDesignerFixture(fixtureId){
 if(!DESIGNER_FIXTURE_IDS.includes(fixtureId))throw new Error('Unknown synthetic designer fixture.');
 if(fixtureId==='ot-fixture-001'||fixtureId==='ot-fixture-002'){
  const initial=initialStates('beacon-steps')[0],trace=[advance(0,2),advance(1,2),advance(0,2)];
  if(fixtureId==='ot-fixture-002')trace.push(advance(1,1));
  return {fixtureId,gameId:'beacon-steps',kind:fixtureId==='ot-fixture-001'?'legal-actions':'terminal-win',cases:[run(initial,trace)]};
 }
 const initial=initialStates('pocket-signals').find(s=>JSON.stringify(s.hands)===JSON.stringify([[2,4],[1,3]]));
 if(!initial)throw new Error('The pinned Pocket Signals reference deal is unavailable.');
 if(fixtureId==='ot-fixture-003')return {fixtureId,gameId:'pocket-signals',kind:'information-pair',viewer:1,cases:[run(initial,[commit(0,2)]),run(initial,[commit(0,4)])]};
 return {fixtureId,gameId:'pocket-signals',kind:'terminal-draw',cases:[run(initial,[commit(0,4),commit(1,1),commit(0,2),commit(1,3)])]};
}
