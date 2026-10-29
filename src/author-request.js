import {getCatalog} from './catalog.js';
export const AUTHOR_REQUEST_SCHEMA='open-table.authoring-request.v1';
export const MAX_AUTHOR_GOAL_LENGTH=2000;
export const AUTHORING_INSTRUCTIONS=[
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

// Pure local preparation: the caller supplies a game ID and explicit author text,
// never a match, browser store, model identity, approval or experiment case.
export function prepareAuthorRequest(gameId,accessGoal){
 const c=getCatalog(gameId);
 if(typeof accessGoal!=='string'||!accessGoal.trim()||accessGoal.length>MAX_AUTHOR_GOAL_LENGTH)
  throw new Error('Describe an access need using 1 to 2,000 characters.');
 const approvedCatalog={gameId:c.gameId,title:c.title,rulesetPin:c.rulesetPin,rules:c.rules,components:c.components,adapters:c.adapters,sourceRefs:c.sourceRefs,fixtures:c.fixtures};
 return {schema:AUTHOR_REQUEST_SCHEMA,gameId:c.gameId,rulesetPin:c.rulesetPin,accessGoal,
  messages:[{role:'system',content:AUTHORING_INSTRUCTIONS},{role:'user',content:JSON.stringify({accessGoal,approvedCatalog})}]};
}
