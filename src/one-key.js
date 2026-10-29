const PACES=new Set([1400,2400,4000]),KEYS=new Set(['Enter',' ']);

/** Focuses only explicit native buttons. Activation remains the browser's default. */
export function createOneKeyController({root,intervalMs=1400}={}){
 if(!root?.ownerDocument)throw new Error('One-key navigation needs a mounted root');
 if(!PACES.has(intervalMs))throw new Error('Unsupported one-key pace');
 const doc=root.ownerDocument,win=doc.defaultView;
 let pace=intervalMs,disposed=false,enabled=false,paused=false,buttons=[],resumeButton=null,current=null,marked=null;
 let suspended=!doc.hasFocus(),focusing=false,releaseBoundary=false,generation=0,dwell=null,deferred=null;
 const held=new Set();
 function usable(button){
  if(button?.tagName!=='BUTTON'||!button.isConnected||!root.contains(button)||button.disabled||button.closest('[hidden],[inert]'))return false;
  const style=win.getComputedStyle(button);
  return style.display!=='none'&&style.visibility!=='hidden'&&button.getClientRects().length>0;
 }
 function candidates(){return [...new Set(enabled&&paused?[resumeButton]:buttons)].filter(usable);}
 function mark(button){
  if(marked!==button){marked?.classList.remove('one-key-current');marked=button;}
  marked?.classList.add('one-key-current');
 }
 function cancel(){generation++;if(dwell!==null)win.clearTimeout(dwell);if(deferred!==null)win.clearTimeout(deferred);dwell=null;deferred=null;}
 function canFocus(){return enabled&&!disposed&&!suspended&&doc.hasFocus()&&held.size===0&&!releaseBoundary;}
 function focusCurrent(){
  const list=candidates();if(!list.includes(current))current=list[0]||null;
  if(!current){mark(null);return false;}
  if(doc.activeElement!==current){focusing=true;try{current.focus();}finally{focusing=false;}}
  mark(doc.activeElement===current?current:null);return doc.activeElement===current;
 }
 function arm(){
  if(!canFocus()||paused||!current)return;
  const epoch=generation;
  dwell=win.setTimeout(()=>{
   dwell=null;if(epoch!==generation||!canFocus())return;
   const list=candidates();if(!list.length){mark(null);return;}
   current=list[(list.indexOf(current)+1)%list.length];
   if(focusCurrent())arm();
  },pace);
 }
 function reconcile(){if(!canFocus())return;if(focusCurrent())arm();}
 function request(){
  cancel();
  if(!enabled||disposed||suspended){mark(null);return;}
  if(held.size)return;
  if(releaseBoundary){
   const epoch=generation;
   deferred=win.setTimeout(()=>{deferred=null;if(epoch!==generation||disposed)return;releaseBoundary=false;reconcile();},0);
  }else reconcile();
 }
 function keydown(event){
  if(disposed||!KEYS.has(event.key))return;
  const target=event.target,inside=root.contains(target);
  if(event.repeat){
   if((enabled&&inside)||held.has(event.key)){event.preventDefault();held.add(event.key);cancel();}
   return;
  }
  if(held.size){event.preventDefault();held.add(event.key);cancel();return;}
  if(!candidates().includes(target))return;
  held.add(event.key);current=target;cancel();
 }
 function keyup(event){
  if(!KEYS.has(event.key)||!held.delete(event.key)||held.size)return;
  releaseBoundary=true;request();
 }
 function focusin(event){
  if(disposed||!enabled||focusing||held.size||releaseBoundary)return;
  if(candidates().includes(event.target)){current=event.target;request();}
 }
 function blur(){suspended=true;held.clear();releaseBoundary=false;cancel();mark(null);}
 function focus(){suspended=!doc.hasFocus();request();}
 win.addEventListener('keydown',keydown,true);
 win.addEventListener('keyup',keyup,true);
 root.addEventListener('focusin',focusin);
 win.addEventListener('blur',blur);
 win.addEventListener('focus',focus);
 return {
  update({enabled:nextEnabled,paused:nextPaused=false,buttons:nextButtons=[],resumeButton:nextResume=null,preferred=null}={}){
   if(disposed)return;
   enabled=Boolean(nextEnabled);paused=Boolean(nextPaused);buttons=[...nextButtons];resumeButton=nextResume;
   const list=candidates();current=list.includes(preferred)?preferred:list.includes(current)?current:list[0]||null;
   request();
  },
  setInterval(next){if(!PACES.has(next))throw new Error('Unsupported one-key pace');pace=next;request();},
  dispose(){
   if(disposed)return;disposed=true;cancel();held.clear();mark(null);
   win.removeEventListener('keydown',keydown,true);win.removeEventListener('keyup',keyup,true);
   root.removeEventListener('focusin',focusin);win.removeEventListener('blur',blur);win.removeEventListener('focus',focus);
  }
 };
}
