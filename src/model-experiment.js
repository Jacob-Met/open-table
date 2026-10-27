import {getCatalog} from './catalog.js';
export const EXPERIMENT_VERSION='open-table.authoring-experiment.v1';
// Authored cases, not a blind user corpus. Reserve the last two from prompt tuning.
const CASES=[
  {
    "id": "beacon-colour-independent",
    "split": "development",
    "gameId": "beacon-steps",
    "goal": "Give the current trail position and the target distinct named shapes plus text, so neither depends on colour. Preserve all moves and the winning condition.",
    "expected": {
      "classification": "equivalence-candidate",
      "requiredTargets": [
        "shape-text:public.position",
        "shape-text:public.target"
      ],
      "requiredSourceRefs": [
        "beacon.rule.public",
        "beacon.rule.win"
      ],
      "review": [
        "Distinguishes the moving position from the fixed target 7.",
        "Adds redundant presentation without extra moves or a new win condition."
      ]
    }
  },
  {
    "id": "beacon-one-switch",
    "split": "development",
    "gameId": "beacon-steps",
    "goal": "Let a player use one switch to cycle through available advance actions and explicitly confirm a selection. Selection must not move the token. Keep the same legal moves near the target.",
    "expected": {
      "classification": "equivalence-candidate",
      "requiredTargets": [
        "switch-select:actions.advance"
      ],
      "requiredSourceRefs": [
        "beacon.rule.move"
      ],
      "review": [
        "Selection and game commitment remain separate.",
        "Only currently legal advances are offered; the near-target case cannot overshoot 7."
      ]
    }
  },
  {
    "id": "pocket-private-reading",
    "split": "development",
    "gameId": "pocket-signals",
    "goal": "Give the current player text and named shape labels for their own remaining hand and their own pending card, available on a deliberate private request. Do not announce the opponent hand or unrevealed commitment.",
    "expected": {
      "classification": "equivalence-candidate",
      "requiredTargets": [
        "shape-text:private.own-hand",
        "shape-text:private.own-pending"
      ],
      "requiredSourceRefs": [
        "pocket.rule.private"
      ],
      "review": [
        "Uses only the already-bound viewer observation.",
        "Does not move private values into public labels or shared announcements.",
        "Does not claim an audio channel or a local shared device guarantees secrecy."
      ]
    }
  },
  {
    "id": "pocket-one-switch",
    "split": "development",
    "gameId": "pocket-signals",
    "goal": "Let the acting player choose an available card with one switch and commit only after explicit confirmation. Keep commitments private until the existing paired reveal.",
    "expected": {
      "classification": "equivalence-candidate",
      "requiredTargets": [
        "switch-select:actions.commit"
      ],
      "requiredSourceRefs": [
        "pocket.rule.commit",
        "pocket.rule.reveal"
      ],
      "review": [
        "Offers only the acting player's legal card choices.",
        "Does not reveal on selection or alter the two-player commitment order."
      ]
    }
  },
  {
    "id": "pocket-weighted-finale",
    "split": "reserved",
    "gameId": "pocket-signals",
    "goal": "Let a player choose and confirm a card with one switch. Also award two points for the second round instead of one, so the finale has greater stakes.",
    "expected": {
      "classification": "variant",
      "requiredTargets": [
        "switch-select:actions.commit"
      ],
      "requiredSourceRefs": [
        "pocket.rule.commit",
        "pocket.rule.points",
        "pocket.rule.finish"
      ],
      "review": [
        "Separates the supported switch adaptation from the requested scoring change.",
        "States that the approved game gives one point in each round and permits a final draw.",
        "Does not treat a passing check of the original switch adapter as fulfillment or certification of the weighted variant."
      ]
    }
  },
  {
    "id": "pocket-shared-pending-choice",
    "split": "reserved",
    "gameId": "pocket-signals",
    "goal": "Give my own hand text and shape labels, and make the other player's unrevealed commitment readable to the entire table before I choose my card.",
    "expected": {
      "classification": "variant",
      "requiredTargets": [
        "shape-text:private.own-hand"
      ],
      "requiredSourceRefs": [
        "pocket.rule.private",
        "pocket.rule.reveal"
      ],
      "review": [
        "Identifies the requested disclosure change even though readable own-hand labels are supported.",
        "Keeps opponent information outside the proposed safe adapter changes.",
        "Routes the changed-information game to separate author review instead of claiming preservation."
      ]
    }
  }
];
export const EXPERIMENT_CASE_IDS=Object.freeze(CASES.map(x=>x.id));
export function getExperimentCase(id){const c=CASES.find(x=>x.id===id);if(!c)throw new Error('Unknown OPEN TABLE authoring experiment case.');return structuredClone(c);}

const INSTRUCTIONS=[
 'Draft one OPEN TABLE adaptation proposal from the supplied approved catalog and access goal.',
 'Return JSON only, with exactly schema, gameId, rulesetPin, classification, summary, changes, witnessCandidates.',
 'schema is open-table.proposal.v1. Echo the supplied gameId and rulesetPin.',
 'classification is equivalence-candidate or variant. It states intent, not a verified result.',
 'Each of 1..8 changes has exactly adapter, componentRef, sourceRefs, rationale. Use only supplied adapter/component pairs and authored source references.',
 'Do not invent or edit game rules, scores, deals, actions, disclosure, player identity, adapters, or approval fields.',
 'If any requested part changes a mechanic or disclosed information, use variant. Explain that unsupported part and ground it in the approved rules, while proposing only supported access changes.',
 'witnessCandidates may contain 0..12 objects with exactly fixtureRef, check, viewer. Use only supplied synthetic fixture references; check is legal-actions, outcome, or player-view; viewer is public, 0, or 1.',
 'Viewer numbers in witness candidates are engine observer IDs, never permission to change a live viewer. Public player labels 1 and 2 correspond to engine observer IDs 0 and 1.',
 'A witness is a candidate for independent checking, not a certificate. Never claim universal accessibility, human validation, or model-certified equivalence.',
 'Summaries and rationales are concise plain text, with maximum lengths 1200 and 800 characters respectively.'
].join('\n');
// Static authored context only. Does not select a provider, make a request, or spend.
export function makeModelRequest(caseId){
 const task=getExperimentCase(caseId),c=getCatalog(task.gameId);
 const approvedCatalog={gameId:c.gameId,title:c.title,rulesetPin:c.rulesetPin,rules:c.rules,components:c.components,adapters:c.adapters,sourceRefs:c.sourceRefs,fixtures:c.fixtures};
 return {experimentVersion:EXPERIMENT_VERSION,caseId:task.id,split:task.split,gameId:c.gameId,rulesetPin:c.rulesetPin,
  messages:[{role:'system',content:INSTRUCTIONS},{role:'user',content:JSON.stringify({accessGoal:task.goal,approvedCatalog})}]};
}
const STOP=new Set('a an and are as at be by can current each for from game in is it its need of on or player players should the their them they this to use using with'.split(' '));
function terms(value){return new Set((value.toLowerCase().match(/[a-z0-9]+/g)||[]).map(w=>w.length>3&&w.endsWith('s')?w.slice(0,-1):w).filter(w=>!STOP.has(w)));}
function overlap(a,b){let n=0;for(const t of a)if(b.has(t))n++;return n;}
// Deliberately limited declared guards, not semantic understanding.
function explicitVariantRequest(gameId,goal){
 if(gameId!=='pocket-signals')return false;
 const affirmative=goal.split(/[.!?;]/).filter(c=>!/^\s*(do not|don't|never)\b/i.test(c)).join('. ');
 return /\b(two|2|double)\s+points?\b/i.test(affirmative)||/\b(show|reveal|display|announce|share)\b[^.!?;]*\b(opponent|other player|both players)\b[^.!?;]*\b(hand|pending|unrevealed|commitment|card)\b/i.test(affirmative);
}
export function deterministicBaseline(caseId){
 const task=getExperimentCase(caseId),c=getCatalog(task.gameId),motor=/\b(switch|motor|press|presses|button)\b/i.test(task.goal);
 const adapter=motor?'switch-select':'shape-text',goalTerms=terms(task.goal),eligible=new Set(c.adapters[adapter]);
 const ranked=c.components.filter(x=>eligible.has(x.ref)).map(component=>({component,score:2*overlap(goalTerms,terms(component.label))+overlap(goalTerms,terms(component.description+' '+component.ref))}))
  .sort((a,b)=>b.score-a.score||a.component.ref.localeCompare(b.component.ref,'en'));
 const changes=ranked.slice(0,motor?1:2).map(({component})=>{
  const context=terms(task.goal+' '+component.label+' '+component.description);
  const rule=c.rules.map(value=>({value,score:overlap(context,terms(value.text))})).sort((a,b)=>b.score-a.score||a.value.ref.localeCompare(b.value.ref,'en'))[0].value;
  return {adapter,componentRef:component.ref,sourceRefs:[rule.ref],rationale:'Use the fixed '+adapter+' adapter for '+component.label+'. Preserve the authored rule: '+rule.text};
 });
 const variant=explicitVariantRequest(task.gameId,task.goal);
 return {schema:'open-table.proposal.v1',gameId:c.gameId,rulesetPin:c.rulesetPin,classification:variant?'variant':'equivalence-candidate',
  summary:variant?'A declared rule-change phrase was detected. These catalog selections cover only the supported access part; the requested variant needs separate author review.':
  'Fixed-catalog draft for the requested access goal. The selector cannot establish that every requested intent is covered; independent checking and author review remain required.',
  changes,witnessCandidates:[]};
}
// Necessary structural conditions only. Call after parseModelProposal; rationale truth requires manual review.
export function proposalComparison(caseId,proposal){
 const expected=getExperimentCase(caseId).expected,targets=new Set(proposal.changes.map(c=>c.adapter+':'+c.componentRef)),refs=new Set(proposal.changes.flatMap(c=>c.sourceRefs));
 return {classificationMatches:proposal.classification===expected.classification,missingTargets:expected.requiredTargets.filter(x=>!targets.has(x)),
  additionalTargets:[...targets].filter(x=>!expected.requiredTargets.includes(x)),missingSourceRefs:expected.requiredSourceRefs.filter(x=>!refs.has(x)),manualReviewConditions:expected.review};
}
