import {initialStates,legalActions,step,observe,outcome} from './games.js';
import {createAdapter,checkAdaptation} from './adaptations.js';
import {parseModelProposal} from './model-proposal.js';
import {getCatalog} from './catalog.js';
import {createPack,importPack} from './pack.js';
import {createOneKeyController} from './one-key.js';
import {inspectSavedMatch,saveStoredMatch,clearStoredMatch} from './saved-match.js';

const GAMES={
 'beacon-steps':{title:'Beacon Steps',symbol:'↗',caption:'A shared path · open information',description:'One shared marker. One or two steps. Reach the seventh light.',rules:['Take turns moving the shared marker one or two spaces.','Land exactly on seven to win. You cannot move beyond it.','The whole board is public. There are no hidden cards or timers.']},
 'pocket-signals':{title:'Pocket Signals',symbol:'◇',caption:'A quiet duel · private cards',description:'Two cards each. Two private choices. Every round counts.',rules:['Each player receives two different cards from one to five; one card stays out.','Player 1 commits, then Player 2. Keep both choices private until both have committed.','Reveal together. The higher card earns one point. Play both rounds; a one–one score is a draw.']}
};
const PACKS={'shape-text':{title:'Shapes + words',description:'Numbers, named shapes, and explicit action labels.'},'switch-select':{title:'Scan + select',description:'Scan the existing choices, then confirm one action.'}};
const SHAPES=['','●','▲','■','◆','★'], NAMES=['','circle','triangle','square','diamond','star'];
const mounted=new WeakMap();
function el(tag,attrs={},...children){
 const node=document.createElement(tag);
 for(const [name,value] of Object.entries(attrs)){
  if(name==='class')node.className=value;
  else if(name.startsWith('on'))node.addEventListener(name.slice(2).toLowerCase(),value);
  else if(name.startsWith('aria-')&&value!==undefined&&value!==null)node.setAttribute(name,String(value));
  else if(value!==false&&value!==undefined&&value!==null)node.setAttribute(name,value===true?'':String(value));
 }
 for(const child of children.flat(Infinity)){
  if(child!==null&&child!==undefined&&child!==false)node.append(child instanceof Node?child:document.createTextNode(String(child)));
 }
 return node;
}
function freshActivation(event){
 if(event.repeat&&(event.key==='Enter'||event.key===' '))event.preventDefault();
}
const actionText=a=>a.type==='advance'?'Advance '+a.steps+' '+(a.steps===1?'space':'spaces'):'Commit card '+a.card;
const labelFor=mode=>PACKS[mode]?.title||mode;
function download(name,text){
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),link=el('a',{href:url,download:name});
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** Trusted-device local prototype. initialState is an authored receiving fixture input,
 * never read from URL, a model proposal, or an imported adaptation pack.
 * Explicit saved-match resume uses a separately validated, build-pinned snapshot. */
export function mountApp(root,{gameId='beacon-steps',initialState,oneKey=false}={}){
 mounted.get(root)?.();
 let selectedGame=gameId,state=initialState?structuredClone(initialState):fresh(gameId);
 if(state.game!==gameId)throw new Error('Fixture game mismatch');
 outcome(state);
 let screen='play',mode='shape-text',seat=null,status='',statusError=false;
 let alive=true,importGeneration=0,heldSpace=false;
 const appDocument=root.ownerDocument,appWindow=appDocument.defaultView;
 // Access the localStorage getter inside the guarded storage operations.
 const matchStorage={getItem:key=>appWindow.localStorage.getItem(key),setItem:(key,value)=>appWindow.localStorage.setItem(key,value),removeItem:key=>appWindow.localStorage.removeItem(key)};
 let savedMatch=inspectSavedMatch(matchStorage),matchPrompt=null,matchMenu=false,matchStatus='',matchError=false,matchReturn='save-match';
 let oneKeyEnabled=Boolean(oneKey),oneKeyPaused=false,oneKeyPhase='setup',oneKeyPace=1400,previousMode='shape-text';
 const oneKeyController=createOneKeyController({root});
 const modeAddressChanged=()=>{if(appWindow.location.hash==='#one-key'){if(!oneKeyEnabled)startOneKey();}else if(oneKeyEnabled)leaveOneKey();};
 appWindow?.addEventListener('hashchange',modeAddressChanged);
 const releaseSpace=()=>{heldSpace=false;};
 appWindow?.addEventListener('blur',releaseSpace);
 const matchEscape=event=>{if(event.key==='Escape'&&matchPrompt){event.preventDefault();cancelMatchAction();}};
 root.addEventListener('keydown',matchEscape);
 let scanIndex=0,scanTimer=null,scanDelay=1400,scanEpoch=0,continuousScan=false,resumeScan=null,labMode=null,labResult=null,proposalText='',proposal=null,proposalError='';
 const checks=new Map(),content=el('div'),live=el('div',{class:'visually-hidden',role:'status','aria-live':'polite','aria-atomic':'true','data-testid':'public-live'});
 root.replaceChildren(content,live);
 function fresh(id){const roots=initialStates(id);return roots[Math.floor(Math.random()*roots.length)];}
 function stopScan(){releaseSpace();if(scanTimer!==null)clearInterval(scanTimer);scanTimer=null;scanEpoch++;}
 const scanVisibilityChanged=()=>{
  if(appDocument.hidden)stopScan();else if(alive&&continuousScan)resumeScan?.();
 };
 appDocument.addEventListener('visibilitychange',scanVisibilityChanged);
 function announce(text){live.textContent=text;}
 function notify(text,error=false){status=text;statusError=error;if(error)announce(text);}
 function publicView(){
  const v=observe(state,0);
  return v.game==='beacon-steps'?v:{game:v.game,round:v.round,turn:v.turn,history:v.history,scores:v.scores,outcome:v.outcome};
 }
 function checkedMode(id,pack){
  const key=id+':'+pack;if(!checks.has(key))checks.set(key,checkAdaptation(id,pack));
  const check=checks.get(key);
  if(!check.ok||!check.complete||check.verdict!=='equivalent')throw new Error('This adaptation has not passed the complete rule check.');
  return check;
 }
 function cover({invalidatePendingImport=true}={}){
  if(invalidatePendingImport)importGeneration++;
  stopScan();seat=null;scanIndex=0;
 }
 function reset(id=selectedGame){
  matchPrompt=null;matchMenu=false;
  if(oneKeyEnabled){oneKeyPhase='play';oneKeyPaused=false;mode='shape-text';continuousScan=false;}
  if(id!==selectedGame)continuousScan=false;
  cover();selectedGame=id;state=fresh(id);labMode=null;labResult=null;proposal=null;proposalError='';proposalText='';
  notify('New game ready.');render(id==='pocket-signals'?'reveal-hand':'table-title');announce('New '+GAMES[id].title+' game ready.');
 }
 function changeScreen(next){
  matchPrompt=null;matchMenu=false;
  if(oneKeyEnabled)endOneKey();
  continuousScan=false;cover();screen=next;render(next==='play'?(selectedGame==='pocket-signals'?'reveal-hand':'table-title'):'workshop-title');
  announce(next==='play'?'Back at the table. Private cards are covered.':'Adaptation workshop. All failure examples are synthetic.');
 }
 function perform(choiceId){
  const p=publicView(),actor=selectedGame==='pocket-signals'?seat:p.turn;
  if(p.outcome.terminal||actor===null||actor!==p.turn)return;
  checkedMode(selectedGame,mode);
  const previousRounds=p.history?.length||0;
  const next=createAdapter(mode).step(state,actor,choiceId);
  cover();state=next;const after=publicView();
  const message=after.outcome.terminal?(after.outcome.winner===null?'Game complete. It is a draw.':'Game complete. Player '+(after.outcome.winner+1)+' wins.')
   :selectedGame==='beacon-steps'?'Marker at '+after.position+'. Player '+(after.turn+1)+' to move.'
   :(after.history.length>previousRounds?'Both cards revealed. Round '+(previousRounds+1)+' is complete. ':'Choice committed privately. ')+
    'Pass to Player '+(after.turn+1)+'.';
  render(selectedGame==='pocket-signals'&&!after.outcome.terminal?'reveal-hand':after.outcome.terminal?'new-game':'current-play-choice');
  announce(message);
 }
 function activatePack(pack){
  if(oneKeyEnabled)endOneKey();
  checkedMode(selectedGame,pack);continuousScan=false;cover();mode=pack;
  notify(labelFor(pack)+' is ready. Rules and player information are preserved in the complete finite-game check.');
  render(selectedGame==='pocket-signals'?'reveal-hand':'table-title');announce('Access pack changed. Private cards are covered.');
 }
 function oneKeyAddress(enabled){
  if(!appWindow)return;
  const url=new URL(appWindow.location.href);if(enabled)url.hash='one-key';else if(url.hash==='#one-key')url.hash='';
  appWindow.history.replaceState(appWindow.history.state,'',url.href);
 }
 function startOneKey(){
  if(oneKeyEnabled)return;
  matchPrompt=null;matchMenu=false;previousMode=mode;continuousScan=false;cover();mode='shape-text';screen='play';
  oneKeyEnabled=true;oneKeyPaused=false;oneKeyPhase='setup';oneKeyAddress(true);
  render();announce('One-key play. Wait for a highlighted game, then press and release Space or Enter.');
 }
 function endOneKey(){
  matchPrompt=null;matchMenu=false;
  continuousScan=false;cover();oneKeyEnabled=false;oneKeyPaused=false;oneKeyPhase='setup';mode=previousMode;oneKeyAddress(false);
 }
 function leaveOneKey(){
  endOneKey();render('table-title');announce('One-key play ended. Private cards are covered.');
 }
 function oneKeyPanel(){
  const phase=oneKeyPaused?'paused':oneKeyPhase;
  const controls=el('div',{class:'one-key-controls'},
   el('button',{id:'one-key-pause',onClick:()=>{cover();oneKeyPaused=!oneKeyPaused;render();announce(oneKeyPaused?'One-key play paused. Private cards are covered.':'One-key play resumed.');}},oneKeyPaused?'Resume one-key play':'Pause one-key play'),
   el('button',{id:'one-key-pace',onClick:()=>{const paces=[1400,2400,4000];oneKeyPace=paces[(paces.indexOf(oneKeyPace)+1)%paces.length];oneKeyController.setInterval(oneKeyPace);render('one-key-pace');announce('One-key pace: '+oneKeyPace/1000+' seconds.');}},'Pace: '+oneKeyPace/1000+' seconds'),
   oneKeyPhase==='play'?el('button',{id:'one-key-menu',onClick:()=>{cover();oneKeyPhase='setup';oneKeyPaused=false;render();announce('Choose a game. Private cards are covered.');}},'Choose a game'):null,
   el('button',{id:'match-menu',onKeyDown:freshActivation,onClick:()=>{continuousScan=false;cover();matchMenu=true;render('match-back');announce('Saved match menu. Private cards are covered.');}},'Save / resume match'),
   el('button',{id:'one-key-exit',onClick:leaveOneKey},'Exit one-key play'));
  return el('section',{class:'pack-panel one-key-panel','aria-labelledby':'one-key-title','data-one-key-state':phase},
   el('h3',{id:'one-key-title'},'Play controls'),controls,
   el('p',{id:'one-key-status'},oneKeyPaused?'Paused. Resume to reach Pace or Exit. Private cards stay covered.':'Focus moves every '+oneKeyPace/1000+' seconds. '+(oneKeyPhase==='setup'?'Choose a game to begin.':'Private hands wait for a fresh press.')),
   el('p',{class:'one-key-instructions'},'Press and release Space or Enter on the outlined button. Hold to keep focus still. Scanning never makes a move.'));
 }
 function oneKeySetup(){
  return el('div',{class:'workspace'},
   el('section',{class:'table-panel one-key-welcome','aria-labelledby':'one-key-setup-title'},
    el('h2',{id:'one-key-setup-title'},'Choose a game. Take your time.'),
    gamePicker(),oneKeyPanel()));
 }
 function updateOneKey(focusId){
  if(!oneKeyEnabled){oneKeyController.update({enabled:false,buttons:[content.querySelector('#one-key-entry')]});return;}
  if(matchPrompt){
   const buttons=['match-cancel','match-confirm'].map(id=>content.querySelector('#'+id));
   oneKeyController.update({enabled:true,paused:false,buttons,preferred:buttons[0]});return;
  }
  if(matchMenu){
   const buttons=['match-back','save-match','resume-match','forget-match'].map(id=>content.querySelector('#'+id)).filter(button=>button&&!button.disabled);
   const preferred=buttons.find(button=>button.id===focusId)||buttons[0];
   oneKeyController.update({enabled:true,paused:false,buttons,preferred});return;
  }
  let primary;
  if(oneKeyPhase==='setup')primary=[...content.querySelectorAll('[data-game]')];
  else if(content.querySelector('#new-game'))primary=[content.querySelector('#new-game')];
  else if(content.querySelector('#reveal-hand'))primary=[content.querySelector('#reveal-hand')];
  else primary=[...content.querySelectorAll('[data-choice]'),content.querySelector('#cover-hand')].filter(Boolean);
  const controls=['one-key-pause','one-key-pace','one-key-menu','match-menu','one-key-exit'].map(id=>content.querySelector('#'+id)).filter(Boolean);
  const preferred=focusId==='one-key-pace'?content.querySelector('#one-key-pace'):primary[0];
  oneKeyController.update({enabled:true,paused:oneKeyPaused,buttons:[...primary,...controls],resumeButton:content.querySelector('#one-key-pause'),preferred});
 }
 function savedSummary(slot){
  return slot.status==='ready'?GAMES[slot.record.gameId].title+' · Saved '+new Date(slot.record.savedAt).toLocaleString():
   slot.status==='empty'?'No saved match yet.':slot.status==='invalid'?'A saved match is present but cannot be resumed here.':'Saved-match storage is unavailable.';
 }
 function matchMessage(text,error=false){matchStatus=text;matchError=error;announce(text);}
 function beginMatchAction(kind){
  if(matchPrompt)return;
  continuousScan=false;cover();savedMatch=inspectSavedMatch(matchStorage);matchReturn=kind+'-match';
  if(savedMatch.status==='unavailable'||kind==='resume'&&savedMatch.status!=='ready'||kind==='forget'&&savedMatch.raw===null){
   matchMessage(savedMatch.message||'There is no saved match to '+kind+'.',true);render(matchReturn);return;
  }
  matchPrompt={kind,expectedRaw:savedMatch.raw,summary:savedSummary(savedMatch)};
  render('match-cancel');announce('Review '+kind+' match. Cancel is selected first.');
 }
 function cancelMatchAction(){
  matchPrompt=null;matchMessage('Cancelled.');render(matchReturn);
 }
 function confirmMatchAction(){
  if(!matchPrompt)return;
  const pending=matchPrompt;matchPrompt=null;continuousScan=false;cover();
  let resumed=false;
  try{
   if(pending.kind==='save'){
    saveStoredMatch(matchStorage,{gameId:selectedGame,state,adapter:mode},pending.expectedRaw);
    matchMessage('Snapshot saved. Later moves will not update it.');
   }else if(pending.kind==='forget'){
    clearStoredMatch(matchStorage,pending.expectedRaw);
    matchMessage('Saved snapshot forgotten. Your current match is still here.');
   }else{
    const current=inspectSavedMatch(matchStorage);
    if(current.status==='unavailable')throw new Error(current.message);
    if(current.raw!==pending.expectedRaw)throw new Error('The saved match changed. Review the current save before trying again.');
    if(current.status!=='ready')throw new Error(current.message||'There is no saved match to resume.');
    const record=current.record,nextMode=oneKeyEnabled?'shape-text':record.adapter;
    checkedMode(record.gameId,nextMode);
    // Every validation happens before live game state changes. The viewer stays covered.
    selectedGame=record.gameId;state=record.state;mode=nextMode;screen='play';
    labMode=null;labResult=null;proposal=null;proposalError='';proposalText='';
    if(oneKeyEnabled){previousMode=record.adapter;oneKeyPhase='play';oneKeyPaused=false;}
    matchMenu=false;resumed=true;notify('');
    matchMessage('Saved match resumed. Private cards stay covered until a fresh reveal.');
   }
  }catch(error){matchMessage(error.message,true);}
  savedMatch=inspectSavedMatch(matchStorage);
  render(resumed?(outcome(state).terminal?'new-game':selectedGame==='pocket-signals'?'reveal-hand':'table-title'):matchReturn);
 }
 function savedMatchPanel(){
  const current=inspectSavedMatch(matchStorage);
  if(!matchError&&(current.raw!==savedMatch.raw||current.status!==savedMatch.status))matchStatus='';
  savedMatch=current;
  const available=savedMatch.status!=='unavailable',ready=savedMatch.status==='ready';
  return el('section',{class:'saved-match-panel',id:'saved-match-panel','aria-labelledby':'saved-match-title'},
   el('p',{class:'eyebrow'},'PICK UP WHERE YOU LEFT OFF'),el('h3',{id:'saved-match-title'},'Keep this match'),
   el('p',{},'One snapshot in this browser. Playing or starting a new game does not update it.'),
   el('p',{id:'saved-match-summary',class:'saved-match-summary'},savedSummary(savedMatch)),
   el('div',{class:'saved-match-tools'},
    oneKeyEnabled&&oneKeyPhase==='setup'?null:el('button',{id:'save-match',disabled:!available,onKeyDown:freshActivation,onClick:()=>beginMatchAction('save')},savedMatch.raw!==null?'Replace snapshot':'Save snapshot'),
    el('button',{id:'resume-match',disabled:!ready,onKeyDown:freshActivation,onClick:()=>beginMatchAction('resume')},'Resume'),
    el('button',{id:'forget-match',disabled:!available||savedMatch.raw===null,onKeyDown:freshActivation,onClick:()=>beginMatchAction('forget')},'Forget')),
   el('p',{class:'status'+(matchError||savedMatch.status==='invalid'||!available?' error':''),'data-testid':'saved-match-status'},
    [...new Set([savedMatch.message||'',matchStatus].filter(Boolean))].join(' ')),
   el('p',{class:'aside-note'},'Snapshots include private cards. Anyone using this browser profile can resume them. Use the same copy and browser to return; clearing browser data may remove the save.'));
 }
 function savedMatchMenu(){
  return el('section',{class:'match-menu table-panel','aria-labelledby':'saved-match-title'},
   el('button',{id:'match-back',onKeyDown:freshActivation,onClick:()=>{matchMenu=false;cover();render(oneKeyPhase==='setup'?undefined:selectedGame==='pocket-signals'?'reveal-hand':'table-title');announce('Back to play. Private cards are covered.');}},'Back to play'),
   savedMatchPanel());
 }
 function matchConfirmation(){
  const pending=matchPrompt,replacing=pending.expectedRaw!==null;
  const title=pending.kind==='save'?(replacing?'Replace saved snapshot?':'Save this match?'):pending.kind==='resume'?'Resume saved snapshot?':'Forget saved snapshot?';
  const explanation=pending.kind==='save'?'Keep '+GAMES[selectedGame].title+' at this moment. '+(replacing?'The previous snapshot will be replaced. ':'')+'Private cards are included in this browser.':
   pending.kind==='resume'?'This replaces the match currently at the table. The saved snapshot stays available, and private cards start covered.':
   'This removes the saved snapshot from this browser. Your current match stays intact.';
  return el('section',{class:'match-confirmation table-panel',id:'match-confirmation','aria-labelledby':'match-confirm-title'},
   el('p',{class:'eyebrow'},'YOUR SAVED MATCH'),el('h2',{id:'match-confirm-title'},title),
   el('p',{class:'saved-match-summary'},pending.summary),el('p',{},explanation),
   el('div',{class:'saved-match-tools'},el('button',{id:'match-cancel',onKeyDown:freshActivation,onClick:cancelMatchAction},'Cancel'),
    el('button',{id:'match-confirm',class:'primary',onKeyDown:freshActivation,onClick:confirmMatchAction},pending.kind==='save'?(replacing?'Replace snapshot':'Save snapshot'):pending.kind==='resume'?'Resume saved match':'Forget snapshot')));
 }
 function gamePicker(){return el('div',{class:'game-picker','aria-label':'Choose an original game'},Object.entries(GAMES).map(([id,g])=>
  el('button',{'aria-pressed':selectedGame===id,'data-game':id,onClick:()=>{if(id===selectedGame&&screen==='workshop'&&!oneKeyEnabled)return;reset(id);}},el('span',{class:'game-symbol','aria-hidden':'true'},g.symbol),
   el('span',{},g.title,el('span',{class:'game-caption'},g.caption)))));}
 function statusNode(){return el('p',{class:'status'+(statusError?' error':''),'data-testid':'pack-status'},status);}
 function packPanel(){
  const input=el('input',{type:'file',accept:'.json,application/json',class:'visually-hidden',id:'pack-file','aria-label':'Open an adaptation pack'});
  input.addEventListener('change',async()=>{
   if(!alive)return;
   const file=input.files?.[0];if(!file)return;
   const generation=++importGeneration;
   const isCurrent=()=>alive&&generation===importGeneration;
   try{
    if(file.size>65536)throw new Error('Pack is too large.');
    const text=await file.text();
    if(!isCurrent())return;
    const received=importPack(text);
    continuousScan=false;cover({invalidatePendingImport:false});
    if(received.gameId!==selectedGame){
     selectedGame=received.gameId;state=fresh(selectedGame);proposal=null;
     proposalError=proposalText.trim()?'The game changed. Review the staged proposal against the current game before approving it.':'';
    }
    mode=received.adapter;checks.set(selectedGame+':'+mode,received.check);
    notify('Pack reopened and checked again against the current rules.');
    render(selectedGame==='pocket-signals'?'reveal-hand':'table-title');announce('Adaptation pack reopened. Private cards are covered.');
   }catch(error){
    if(!isCurrent())return;
    const recovery=error.message==='This pack targets stale or different approved rules/adapters. Nothing was activated.'?
     ' To recreate it, keep this game selected, choose Shapes + words or Scan + select under Your access pack, then Save pack. Your current match is unchanged.':'';
    notify('Could not open pack: '+error.message+recovery,true);render('open-pack');
   }
  });
  return el('section',{class:'pack-panel','aria-labelledby':'pack-title'},
   el('p',{class:'eyebrow'},'MAKE ROOM AT THE TABLE'),el('h3',{id:'pack-title'},'Your access pack'),
   el('p',{},'Choose a presentation that works for your table. The legal choices stay the same.'),
   el('button',{id:'one-key-entry',class:'one-key-entry',onClick:startOneKey},'Play with one key ↗'),
   el('div',{class:'pack-options'},Object.entries(PACKS).map(([id,p])=>el('button',{'aria-pressed':mode===id,'data-pack':id,onClick:()=>activatePack(id)},p.title,el('span',{},p.description)))),
   el('div',{class:'pack-tools'},el('button',{id:'save-pack',onClick:()=>{
    try{const pack=createPack(selectedGame,mode);download(selectedGame+'-'+mode+'.open-table.json',typeof pack==='string'?pack:JSON.stringify(pack,null,2));
     notify('Pack saved with its rule pin. Private cards and play history are not included.');render('save-pack');announce('Adaptation pack saved.');
    }catch(e){notify(e.message,true);render('save-pack');}
   }},'Save pack ↓'),el('button',{id:'open-pack',onClick:()=>{continuousScan=false;cover();render('open-pack');content.querySelector('#pack-file').click();}},'Open pack ↑')),input,statusNode());
 }
 function rulesPanel(){return el('section',{class:'rules-panel'},el('h3',{},'How to play'),
  el('ol',{},GAMES[selectedGame].rules.map(text=>el('li',{},text))),
  el('p',{class:'aside-note'},selectedGame==='pocket-signals'?'A cooperative, shared-device prototype. Look away during the other player’s private turn; this is not secure remote multiplayer.':'A small original game with no timing, memory, or dexterity requirement in its rules.'),
  oneKeyEnabled?null:el('button',{class:'text-button small',onClick:()=>changeScreen('workshop')},'See what the checker preserves ↗'));}
 function playerTag(turn){return el('span',{class:'player-tag'},el('span',{class:'player-dot'+(turn===1?' two':''),'aria-hidden':'true'}),'Player '+(turn+1)+' to move');}
 function board(v){
  const title=el('div',{class:'turn-line'},v.outcome.terminal?el('span',{class:'player-tag'},'Game complete'):playerTag(v.turn),
   selectedGame==='beacon-steps'?el('span',{},'Exact arrival · 7'):el('span',{class:'scoreline'},'P1 '+v.scores[0]+' points',' · ','P2 '+v.scores[1]+' points'));
  if(selectedGame==='beacon-steps'){
   const track=el('div',{class:'track','aria-label':'Shared path, marker at '+v.position},
    Array.from({length:8},(_,n)=>el('div',{class:'station'+(v.position===n?' active':'')+(n===7?' target':''),'aria-label':'Space '+n+(v.position===n?', marker here':'')+(n===7?', goal':'')},
     el('span',{class:'station-num'},n),v.position===n?el('span',{class:'marker','aria-hidden':'true'}):el('span',{class:'station-mark'},n===7?'Goal':n===0?'Start':'·'))));
   return el('div',{class:'table-surface','data-testid':'board'},title,track,el('p',{class:'track-note'},'One marker, shared by both players. The player who reaches seven wins.'));
  }
  const rounds=el('div',{class:'rounds'},v.history.map((r,i)=>el('span',{class:'round-chip'},'Round '+(i+1)+': P1 played '+r.cards[0]+' · P2 played '+r.cards[1])));
  if(v.outcome.terminal)return el('div',{class:'table-surface','data-testid':'board'},title,rounds,endResult(v));
  if(seat!==v.turn)return el('div',{class:'table-surface','data-testid':'board'},title,rounds,
   el('div',{class:'curtain','data-testid':'handoff'},el('div',{class:'curtain-mark','aria-hidden':'true'},'◇ ◇'),
    el('h3',{},'Over to Player '+(v.turn+1)),el('p',{},'Pass the device. When the other player has looked away, uncover your own cards.'),
    el('button',{id:'reveal-hand',onKeyDown:freshActivation,onClick:()=>{importGeneration++;seat=v.turn;scanIndex=0;render('private-title');}},'I’m Player '+(v.turn+1)+' — show my hand')));
  const ownView=createAdapter(mode).observe(state,seat);
  return el('div',{class:'table-surface','data-testid':'board'},title,rounds,
   el('p',{class:'private-label',id:'private-title',tabindex:'-1'},'Player '+(seat+1)+' · your private hand · round '+ownView.round),
   el('div',{class:'hand','data-testid':'private-hand'},ownView.hand.map(card=>el('div',{class:'playing-card','aria-label':'Card '+card+', '+NAMES[card]},
    el('span',{class:'card-number','aria-hidden':'true'},card),el('span',{class:'card-shape','aria-hidden':'true'},SHAPES[card]),el('span',{class:'card-name','aria-hidden':'true'},NAMES[card])))),
   el('p',{class:'private-label'},'Only your cards are shown. Choose below; both cards reveal together.'),
   el('button',{class:'text-button small',id:'cover-hand',onClick:()=>{cover();render('reveal-hand');announce('Private cards covered.');}},'Cover my hand'));
 }
 function endResult(v){return el('div',{class:'end-result'},el('h3',{},v.outcome.winner===null?'A well-matched draw.':'Player '+(v.outcome.winner+1)+' takes it.'),
  el('p',{},selectedGame==='beacon-steps'?'The marker reached the seventh light.':'Two rounds, one point each. The table is open for another game.'),
  el('button',{class:'primary',id:'new-game',onKeyDown:freshActivation,onClick:()=>reset()},'Play again ↗'));}
 function scanActions(choices){
  scanIndex=Math.min(scanIndex,choices.length-1);
  const list=el('ol',{class:'scan-choices','aria-label':'Available choices'},choices.map((c,i)=>el('li',{class:i===scanIndex?'selected':'','data-scan-index':i},c.label)));
  const choose=el('button',{class:'primary',id:'confirm-choice',onKeyDown:event=>{
   freshActivation(event);
   if(event.key===' '&&!event.repeat)heldSpace=true;
  },onKeyUp:event=>{if(event.key===' ')releaseSpace();},onBlur:releaseSpace,
  onClick:()=>{releaseSpace();perform(choices[scanIndex].id);}},'Confirm: '+choices[scanIndex].label);
  const paint=()=>{
   list.querySelectorAll('li').forEach((n,i)=>{n.classList.toggle('selected',i===scanIndex);if(i===scanIndex)n.setAttribute('aria-current','true');else n.removeAttribute('aria-current');});
   choose.textContent='Confirm: '+choices[scanIndex].label;
  };
  const next=()=>{scanIndex=(scanIndex+1)%choices.length;paint();};
  const begin=()=>{
   stopScan();if(!alive||appDocument.hidden||!continuousScan)return;const epoch=scanEpoch;
   scanTimer=setInterval(()=>{if(epoch===scanEpoch&&continuousScan&&!heldSpace&&!appDocument.hidden)next();},scanDelay);
  };
  const toggle=el('button',{id:'toggle-scan','aria-pressed':continuousScan,onKeyDown:freshActivation,onClick:()=>{
   continuousScan=!continuousScan;
   if(continuousScan){begin();choose.focus();}else stopScan();
   toggle.textContent=continuousScan?'Pause auto scan':'Start auto scan';
   toggle.setAttribute('aria-pressed',String(continuousScan));
  }},continuousScan?'Pause auto scan':'Start auto scan');
  const speed=el('select',{id:'scan-speed','aria-label':'Scan interval',onChange:e=>{
   scanDelay=Number(e.target.value);if(scanTimer!==null)begin();
  }},[1400,2400,4000].map(ms=>el('option',{value:ms,selected:ms===scanDelay},ms/1000+' seconds')));
  resumeScan=begin;paint();if(continuousScan)begin();
  return el('div',{},list,el('div',{class:'scan-controls'},el('button',{id:'next-choice',onClick:next},'Next choice'),choose),
   el('div',{class:'scan-controls'},toggle,speed),
   el('p',{class:'scan-hint'},'Start auto scan once to continue across turns. Press Enter on Confirm to make one move, or hold Space to keep the choice fixed and release to confirm. Private hands wait for a fresh press on Show my hand. Leaving the tab pauses scanning; returning keeps the choice and starts a full interval. Pause at any time, or use Next choice manually.'));
 }
 function comparison(v){
  if(v.outcome.terminal)return selectedGame==='beacon-steps'?endResult(v):null;
  if(selectedGame==='pocket-signals'&&seat!==v.turn)return oneKeyEnabled?null:el('div',{class:'checked-note'},el('span',{class:'check-glyph'},'✓'),'Private choices are cleared from both views between turns.');
  const p=v.turn,adapter=createAdapter(mode),choices=adapter.actions(state,p),original=legalActions(state,p);
  if(oneKeyEnabled)return el('section',{class:'one-key-actions','aria-label':'Available choices'},
   el('h3',{class:'column-title'},'Your choices'),
   el('div',{class:'choice-buttons'},choices.map(c=>el('button',{'data-choice':c.id,onKeyDown:freshActivation,onClick:()=>perform(c.id)},c.label,el('span',{class:'action-arrow','aria-hidden':'true'},'↗')))));
  return el('div',{class:'comparison','data-testid':'choice-comparison'},
   el('section',{'aria-label':'Adapted choices'},el('h3',{class:'column-title'},'Player '+(p+1)+' · '+labelFor(mode)),
    mode==='switch-select'?scanActions(choices):el('div',{class:'choice-buttons'},choices.map(c=>el('button',{'data-choice':c.id,onKeyDown:freshActivation,onClick:()=>perform(c.id)},c.label,el('span',{class:'action-arrow','aria-hidden':'true'},'↗'))))),
   el('details',{class:'choice-explanation'},el('summary',{},'How these choices match the original game'),
    el('p',{},'These are the original rules’ choices, shown for explanation—not extra controls. Use the play buttons above to take your turn.'),
    el('ul',{class:'original-actions','aria-label':'Original choices'},original.map(a=>el('li',{},actionText(a))))));
 }
 function play(){
  const v=publicView(),check=checkedMode(selectedGame,mode);
  return el('div',{class:'workspace'},
   el('section',{class:'table-panel','aria-labelledby':'table-title'},el('div',{class:'table-heading'},
    el('div',{},el('h2',{id:'table-title',tabindex:'-1'},GAMES[selectedGame].title),
     oneKeyEnabled?null:el('p',{},GAMES[selectedGame].description)),
    oneKeyEnabled?null:el('span',{class:'game-number'},selectedGame==='beacon-steps'?'GAME / 01':'GAME / 02')),
    board(v),comparison(v),
    oneKeyEnabled?oneKeyPanel():el('div',{class:'checked-note'},el('span',{class:'check-glyph','aria-hidden':'true'},'✓'),
     el('span',{},'Same legal choices. Same outcomes. Same player information. ',el('span',{},'Checked across all '+check.states+' reachable states of this original game.')))),
   el('aside',{class:'sidebar'},oneKeyEnabled?null:packPanel(),oneKeyEnabled?null:savedMatchPanel(),rulesPanel()));
 }
 function runLab(pack,checkedGame=selectedGame){cover();labMode=pack;labResult=checkAdaptation(checkedGame,pack);render('lab-result');}
 function labEvidence(){
  if(!labResult)return el('div',{class:'lab-result'},el('h3',{},'Try a change. Keep the game.'),el('p',{},'Choose an adaptation to compare every reachable state, action, outcome, and player view.'));
  const r=labResult,passed=r.ok&&r.complete;
  const box=el('div',{class:'lab-result'+(passed?'':' rejected'),id:'lab-result',tabindex:'-1','data-testid':'lab-result'},
   el('h3',{},passed?'The game is preserved.':'This change breaks the promise.'),
   el('p',{'data-testid':'checked-game'},'Checked game: '+GAMES[r.gameId].title),
   el('p',{},passed?'This fixed adaptation preserves the complete finite game. It still needs playtesting with the people who will use it.':'The independent checker rejected this synthetic adaptation: '+r.reason.replaceAll('-',' ')+'.'));
  if(passed){
   box.append(el('ul',{class:'checks'},['✓ Every legal choice has exactly one adapted choice.','✓ Every move and terminal outcome matches.','✓ Both players retain exactly the same information.'].map(t=>el('li',{},t))),
    el('p',{class:'receipt-line'},r.states+' states · '+r.transitions+' transitions · '+r.initialStates+' initial states. No sampling.'));
   if(PACKS[labMode]){
    if(r.gameId===selectedGame)box.append(el('button',{class:'primary',id:'use-checked-pack',onClick:()=>{mode=labMode;changeScreen('play');}},'Use this pack at the table ↗'));
    else box.append(el('p',{},'Check an adaptation for '+GAMES[selectedGame].title+' before using it at the table.'));
   }
   else box.append(el('p',{},'This negative control has no hidden cards to expose in Beacon Steps. Try the Pocket Signals leakage case.'));
  }else{
   const c=r.counterexample;
   box.append(el('p',{},'Designer example only. These are synthetic states, separate from your game. Your current game’s progress is preserved.'));
   if(c.left&&c.right){
    box.append(el('div',{class:'witness-pair'},[c.left,c.right].map((side,i)=>{
     const base=side.baseView.observation,adapted=side.adaptedView.observation;
     return el('div',{class:'witness'},el('strong',{},'Synthetic state '+(i===0?'A':'B')),
      el('div',{},'Observer: Player '+(c.player+1)),
      el('div',{},'Own hand: '+(base.hand||[]).join(', ')),
      el('div',{},'Original observation: the same in both states.'),
      el('div',{},'Leaked opponent cards: '+(adapted.opponentPrivate?.hand||[]).join(', ')));
    })));
   }else if(c.expected&&c.choices)box.append(el('p',{},'Original legal choices: '+c.expected.map(actionText).join(' / ')+'. Offered after adaptation: '+c.choices.map(x=>x.label).join(' / ')+'.'));
  }
  return box;
 }
 function exampleProposal(){
  const c=getCatalog(selectedGame),adapter='shape-text';
  return {schema:'open-table.proposal.v1',gameId:selectedGame,rulesetPin:c.rulesetPin,classification:'equivalence-candidate',
   summary:'An authored example: make the existing choices explicit with named shapes and words.',
   changes:[{adapter,componentRef:c.adapters[adapter][0],sourceRefs:c.sourceRefs.slice(0,2),rationale:'Retain the existing component meaning while adding an explicit textual label.'}],witnessCandidates:[]};
 }
 function proposalPanel(){
  const catalog=getCatalog(selectedGame);
  const text=el('textarea',{id:'proposal-json',spellcheck:'false','aria-label':'Staged proposal JSON','aria-invalid':proposalError?'true':undefined,'aria-describedby':proposalError?'proposal-error':undefined});
  text.value=proposalText;text.addEventListener('input',()=>{proposalText=text.value;proposal=null;proposalError='';text.removeAttribute('aria-invalid');text.removeAttribute('aria-describedby');preview.replaceChildren();});
  const preview=el('div',{class:'proposal-preview'});
  if(proposalError)preview.append(el('p',{class:'status error',id:'proposal-error'},proposalError));
  if(proposal){
   preview.append(el('h4',{},proposal.classification==='variant'?'Variant idea — author review required':'Candidate — awaiting author review'),el('p',{},proposal.summary));
   for(const change of proposal.changes){
    preview.append(el('p',{},labelFor(change.adapter)+': '+change.rationale));
    for(const ref of change.sourceRefs){
     const rule=catalog.rules.find(r=>r.ref===ref);preview.append(el('blockquote',{},rule?.text||ref));
    }
   }
   if(proposal.classification==='equivalence-candidate'){
    preview.append(el('p',{},'Review each mode as a separate pack. Combined modes are not certified here.'),
     el('div',{class:'proposal-buttons'},[...new Set(proposal.changes.map(c=>c.adapter))].map(pack=>el('button',{onClick:()=>runLab(pack)},'Approve & check '+labelFor(pack)))));
   }else preview.append(el('p',{},'A variant cannot activate as a preserving access pack.'));
  }
  return el('section',{class:'proposal-panel'},el('p',{class:'eyebrow'},'AUTHORING, WITH A HUMAN IN THE LOOP'),el('h3',{},'Ground each proposal.'),
   el('p',{},'Review suggested changes beside the approved rule phrases. A proposal cannot change the rules, expose a private hand, or certify itself.'),
   el('label',{class:'input-label',for:'proposal-json'},'Staged proposal'),text,
   el('div',{class:'proposal-buttons'},el('button',{id:'load-example',onClick:()=>{proposalText=JSON.stringify(exampleProposal(),null,2);proposal=null;proposalError='';render('proposal-json');announce('Authored example loaded. Review it before approving.');}},'Load authored example'),
    el('button',{class:'primary',id:'validate-proposal',onClick:()=>{
     try{proposal=parseModelProposal(proposalText,catalog);proposalError='';}
     catch(error){proposal=null;proposalError=error.message;}
     render('validate-proposal');
     announce(proposalError?'Proposal not ready. '+proposalError:proposal.classification==='variant'?'Variant idea reviewed. It cannot activate as a preserving access pack.':'Candidate ready for author review. Approve a mode to run its independent check.');
    }},'Review proposal')),
   el('p',{class:'aside-note'},'The example is authored test data. No NVIDIA/Nebius inference has run in this prototype yet.'),preview,
   el('details',{},el('summary',{},'Approved rules & current pin'),el('div',{class:'pin'},catalog.rulesetPin),
    el('ol',{},catalog.rules.map(rule=>el('li',{},rule.text)))));
 }
 function workshop(){return el('section',{class:'workshop','aria-labelledby':'workshop-title'},
  el('p',{class:'eyebrow'},'THE ADAPTATION WORKSHOP'),el('h2',{id:'workshop-title',tabindex:'-1'},'Change the presentation. Check the promise.'),
  el('p',{class:'workshop-intro'},'Explore what an access pack preserves, and inspect a concrete failure when it does not. Negative controls use synthetic examples and preserve your current game’s progress. Private cards stay covered.'),
  el('div',{class:'workshop-grid'},el('div',{},
   el('div',{class:'lab-options'},el('button',{onClick:()=>runLab('shape-text'),'data-lab':'shape-text'},'Check shapes + words ↗'),
    el('button',{onClick:()=>runLab('switch-select'),'data-lab':'switch-select'},'Check scan + select ↗'),
    el('button',{class:'negative',onClick:()=>runLab('drop-action'),'data-lab':'drop-action'},'Negative control: remove a legal choice'),
    el('button',{class:'negative',onClick:()=>runLab('reveal-opponent','pocket-signals'),'data-lab':'reveal-opponent'},'Negative control: leak a Pocket Signals hand')),
   labEvidence()),proposalPanel()));}
 function render(focusId){
  if(!alive)return;
  resumeScan=null;stopScan();
  const page=el('div',{class:oneKeyEnabled?'shell one-key-shell':screen==='play'?'shell play-shell':'shell'},el('header',{class:'topbar'},el('div',{class:'brand'},el('span',{class:'brand-mark','aria-hidden':'true'}),'OPEN TABLE'),
   el('span',{class:'top-note'},'Original games. Thoughtful adaptations.'),
   oneKeyEnabled?el('span',{class:'one-key-badge'},'ONE-KEY PLAY'):matchPrompt?null:el('nav',{class:'tabs','aria-label':'Workspace'},el('button',{'aria-pressed':screen==='play',id:'play-tab',onClick:()=>changeScreen('play')},'At the table'),
    el('button',{'aria-pressed':screen==='workshop',id:'workshop-tab',onClick:()=>changeScreen('workshop')},'Adaptation workshop'))),
   el('main',{id:'main'},oneKeyEnabled?el('h1',{class:'visually-hidden'},'One-key play'):screen==='play'?el('h1',{class:'visually-hidden'},'Open Table — choose a game and play'):el('section',{class:'hero'},el('div',{},el('p',{class:'eyebrow'},'EVERYONE HAS A SEAT.'),
    el('h1',{},'Same game. ',el('br'),el('em',{},'New ways to play.')),
    el('p',{class:'intro'},'Make room for different ways of seeing, choosing, and taking a turn. Keep the choices that make the game yours.')),
    el('div',{class:'hero-art','aria-hidden':'true'},el('div',{class:'hero-disc'}),el('div',{class:'hero-card'},'◇'),el('div',{class:'hero-token'},'7'))),
    !oneKeyEnabled&&!matchPrompt?gamePicker():null,matchPrompt?matchConfirmation():matchMenu?savedMatchMenu():oneKeyEnabled&&oneKeyPhase==='setup'?oneKeySetup():screen==='play'?play():workshop(),
    !oneKeyEnabled&&!matchPrompt&&!matchMenu&&screen==='play'?el('details',{class:'about-table'},el('summary',{},'About Open Table and these adaptations'),
     el('h2',{},'Same game. New ways to play.'),
     el('p',{},'Make room for different ways of seeing, choosing, and taking a turn. Choose a presentation in Your access pack. The choices, outcomes and player information stay the same for these two original games.'),
     el('p',{},'Explore the Adaptation workshop to inspect the finite-game checks and synthetic examples. Accessibility and enjoyment still need playtesting with people.')):null),
   el('footer',{class:'footer'},el('p',{},'OPEN TABLE / An original, private prototype. Rule equivalence is checked for these finite games; accessibility and enjoyment need playtesting with people.'),
    el('p',{},'A place for every player.')));
  content.replaceChildren(page);
  updateOneKey(focusId);
  const target=continuousScan&&scanTimer!==null?'confirm-choice':focusId;
  if(!oneKeyEnabled&&target){
   const next=target==='current-play-choice'?(content.querySelector('[data-choice]')||content.querySelector('#confirm-choice')):content.querySelector('#'+target);
   next?.focus();
   if(next?.matches('[data-choice],#confirm-choice'))next.scrollIntoView({block:'nearest',inline:'nearest'});
  }
 }
 function dispose(){
  if(!alive)return;
  alive=false;importGeneration++;resumeScan=null;stopScan();oneKeyController.dispose();appWindow?.removeEventListener('hashchange',modeAddressChanged);appWindow?.removeEventListener('blur',releaseSpace);appDocument.removeEventListener('visibilitychange',scanVisibilityChanged);root.removeEventListener('keydown',matchEscape);
  if(mounted.get(root)===dispose){mounted.delete(root);root.replaceChildren();}
 }
 if(oneKeyEnabled)oneKeyAddress(true);
 mounted.set(root,dispose);render();
 return {destroy:dispose};
}
if(document.getElementById('app'))mountApp(document.getElementById('app'),{oneKey:location.hash==='#one-key'});
