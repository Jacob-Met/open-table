import test from 'node:test';
import assert from 'node:assert/strict';
import {parseModelProposal} from '../src/model-proposal.js';
const catalog={gameId:'pocket-signals',rulesetPin:'sha256:'+'a'.repeat(64),
 adapters:{'shape-text':['public.scores','private.own-hand'],'switch-select':['actions.commit']},
 sourceRefs:['rule.own-card','rule.equal-round-points','rule.private-until-both'],
 fixtureRefs:['synthetic.pending-p0','synthetic.final-draw']};
const candidate={schema:'open-table.proposal.v1',gameId:'pocket-signals',rulesetPin:catalog.rulesetPin,
 classification:'equivalence-candidate',summary:'Labelled shapes and explicit switch selection.',
 changes:[{adapter:'shape-text',componentRef:'private.own-hand',sourceRefs:['rule.own-card','rule.private-until-both'],rationale:'Describe only the current player own cards.'},
 {adapter:'switch-select',componentRef:'actions.commit',sourceRefs:['rule.own-card'],rationale:'Cycle legal actions and commit on explicit confirmation.'}],
 witnessCandidates:[{fixtureRef:'synthetic.pending-p0',check:'player-view',viewer:1},{fixtureRef:'synthetic.final-draw',check:'outcome',viewer:'public'}]};
test('accepts a detached proposal bound to current trusted catalog',()=>{
 const p=parseModelProposal(JSON.stringify(candidate),catalog); assert.deepEqual(p,candidate);
 p.changes[0].rationale='Edited'; assert.notEqual(p.changes[0].rationale,candidate.changes[0].rationale); assert.equal(Object.hasOwn(p,'certified'),false);
});
test('variant is unapproved routing classification, not rule authority',()=>{
 const p=structuredClone(candidate);p.classification='variant';
 assert.equal(parseModelProposal(JSON.stringify(p),catalog).classification,'variant');
 p.scoring=[1,2];assert.throws(()=>parseModelProposal(JSON.stringify(p),catalog),/unknown field/);
});
const cases=[
 ['stale pin',p=>{p.rulesetPin='sha256:'+'b'.repeat(64)},/stale or mismatched/],
 ['wrong game',p=>{p.gameId='beacon-steps'},/selected game/],
 ['model rules',p=>{p.rules={roundPoints:[1,2]}},/unknown field/],
 ['model certification',p=>{p.certified=true},/unknown field/],
 ['invented adapter',p=>{p.changes[0].adapter='private-reader'},/unsupported authoring adapter/],
 ['negative leakage mode',p=>{p.changes[0].adapter='reveal-opponent'},/unsupported authoring adapter/],
 ['negative drop mode',p=>{p.changes[1].adapter='drop-action'},/unsupported authoring adapter/],
 ['component outside mode',p=>{p.changes[1].componentRef='private.own-hand'},/unknown approved reference/],
 ['permission override',p=>{p.changes[0].viewer='public'},/unknown field/],
 ['invented source',p=>{p.changes[0].sourceRefs=['invented.rule']},/unknown approved reference/],
 ['live witness',p=>{p.witnessCandidates[0].fixtureRef='live-session-123'},/unknown approved reference/],
 ['raw state',p=>{p.witnessCandidates[0].fixtureRef='{"hands":[[1,2],[4,5]]}'},/unknown approved reference/],
 ['witness verdict',p=>{p.witnessCandidates[0].passed=true},/unknown field/],
 ['unknown player',p=>{p.witnessCandidates[0].viewer=2},/expected public, 0, or 1/]
];
for(const [name,mutate,expected] of cases)test('rejects '+name,()=>{
 const p=structuredClone(candidate);mutate(p);assert.throws(()=>parseModelProposal(JSON.stringify(p),catalog),expected);
});
test('catalog cannot promote designer negative mode',()=>{
 const c=structuredClone(catalog),p=structuredClone(candidate);c.adapters['reveal-opponent']=['private.own-hand'];p.changes[0].adapter='reveal-opponent';
 assert.throws(()=>parseModelProposal(JSON.stringify(p),c),/unsupported authoring adapter/);
});
test('rejects fences and prototype-shaped fields',()=>{
 assert.throws(()=>parseModelProposal('\x60\x60\x60json\n'+JSON.stringify(candidate)+'\n\x60\x60\x60',catalog),/invalid JSON/);
 const p=JSON.stringify(candidate).replace('"summary":','"__proto__":{"polluted":true},"summary":');
 assert.throws(()=>parseModelProposal(p,catalog),/unknown field/);assert.equal({}.polluted,undefined);
});
