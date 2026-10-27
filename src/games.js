/**
 * Original OPEN TABLE games, rules v1.
 * Full state/stateKey contain private truth and belong only to the designer checker.
 * Player interfaces use observe(state, player) and actor-scoped legalActions.
 */
const BEACON='beacon-steps',POCKET='pocket-signals';
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function fields(value,names,label){
 if(value===null||typeof value!=='object'||Array.isArray(value)||
 ![Object.prototype,null].includes(Object.getPrototypeOf(value))||
 Reflect.ownKeys(value).length!==names.length||names.some(n=>!own(value,n)))throw new TypeError('Malformed '+label);
}
function playerId(player){if(player!==0&&player!==1)throw new RangeError('Player must be 0 or 1');return player;}
function cardValue(card){if(!Number.isInteger(card)||card<1||card>5)throw new TypeError('Cards must be distinct integer values from 1 through 5');return card;}
function pair(value,label){if(!Array.isArray(value)||value.length!==2)throw new TypeError(label+' must contain exactly two entries');return Array.from(value);}
function checked(state){
 if(state===null||typeof state!=='object'||Array.isArray(state))throw new TypeError('Malformed game state');
 if(state.game===BEACON){
  fields(state,['game','position','turn'],'Beacon Steps state');playerId(state.turn);
  if(!Number.isInteger(state.position)||state.position<0||state.position>7||(state.position===0&&state.turn!==0)||(state.position===1&&state.turn!==1))throw new TypeError('Unreachable Beacon Steps state');
  return {game:BEACON,position:state.position,turn:state.turn};
 }
 if(state.game!==POCKET)throw new RangeError('Unknown game');
 fields(state,['game','hands','committed','history'],'Pocket Signals state');
 if(!Array.isArray(state.history)||state.history.length>2)throw new TypeError('Pocket Signals has exactly two possible rounds');
 const history=Array.from(state.history,round=>{fields(round,['cards'],'revealed round');return {cards:pair(round.cards,'Revealed cards').map(cardValue)};});
 const hands=pair(state.hands,'Hands').map(hand=>{
  if(!Array.isArray(hand)||hand.length!==2-history.length)throw new TypeError('Hand size must match the revealed round count');
  return Array.from(hand,cardValue).sort((a,b)=>a-b);
 });
 const allCards=[...hands.flat(),...history.flatMap(round=>round.cards)];
 if(allCards.length!==4||new Set(allCards).size!==4)throw new TypeError('Hands and revealed history must conserve four distinct cards');
 const committed=pair(state.committed,'Commitments');
 if(committed[1]!==null||(committed[0]!==null&&!hands[0].includes(committed[0]))||(history.length===2&&committed[0]!==null))throw new TypeError('Invalid private commitment phase');
 return {game:POCKET,hands,committed,history};
}
function actor(s){if(s.game===BEACON)return s.position===7?null:s.turn;if(s.history.length===2)return null;return s.committed[0]===null?0:1;}
function actionsFor(s,p){
 if(actor(s)!==p)return [];
 if(s.game===BEACON)return [1,2].filter(steps=>s.position+steps<=7).map(steps=>({type:'advance',player:p,steps}));
 return s.hands[p].map(card=>({type:'commit',player:p,card}));
}
function resultFor(s){
 if(s.game===BEACON){const terminal=s.position===7;return {terminal,winner:terminal?1-s.turn:null};}
 const scores=[0,0];for(const round of s.history)scores[round.cards[0]>round.cards[1]?0:1]+=1;
 const terminal=s.history.length===2,winner=!terminal||scores[0]===scores[1]?null:scores[0]>scores[1]?0:1;
 return {terminal,winner,scores};
}
export function initialStates(id){
 if(id===BEACON)return [{game:BEACON,position:0,turn:0}];if(id!==POCKET)throw new RangeError('Unknown game');
 const states=[];
 for(let a=1;a<=4;a++)for(let b=a+1;b<=5;b++){
  const rest=[1,2,3,4,5].filter(c=>c!==a&&c!==b);
  for(let c=0;c<rest.length;c++)for(let d=c+1;d<rest.length;d++)states.push({game:POCKET,hands:[[a,b],[rest[c],rest[d]]],committed:[null,null],history:[]});
 }
 return states;
}
export function legalActions(state,player){playerId(player);return actionsFor(checked(state),player);}
export function step(state,action){
 const next=checked(state),keys=next.game===BEACON?['type','player','steps']:['type','player','card'];
 fields(action,keys,'action');playerId(action.player);
 if(!actionsFor(next,action.player).some(allowed=>keys.every(k=>allowed[k]===action[k])))throw new RangeError('Illegal action for this actor and state');
 if(next.game===BEACON){next.position+=action.steps;next.turn=1-next.turn;}
 else if(action.player===0)next.committed[0]=action.card;
 else{
  const cards=[next.committed[0],action.card];
  next.hands=next.hands.map((hand,p)=>hand.filter(card=>card!==cards[p]));
  next.history.push({cards});next.committed=[null,null];
 }
 return next;
}
export function observe(state,player){
 playerId(player);const current=checked(state),result=resultFor(current);
 if(current.game===BEACON)return {game:BEACON,player,position:current.position,target:7,turn:actor(current),outcome:result};
 return {game:POCKET,player,round:Math.min(2,current.history.length+1),turn:actor(current),hand:current.hands[player].slice(),pendingCard:current.committed[player],history:current.history.map(round=>({cards:round.cards.slice()})),scores:result.scores.slice(),outcome:result};
}
export function outcome(state){return resultFor(checked(state));}
export function stateKey(state){return JSON.stringify(checked(state));}
