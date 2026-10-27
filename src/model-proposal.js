const SCHEMA = 'open-table.proposal.v1';
const MODES = new Set(['shape-text', 'switch-select']);
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function invalid(path, message) { throw new Error(path + ': ' + message); }
function record(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(path + '.' + key, 'unknown field');
  for (const key of keys) if (!own(value, key)) invalid(path + '.' + key, 'required field');
}
function text(value, limit, path) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    invalid(path, 'expected nonblank text of at most ' + limit + ' characters');
}
function list(value, min, max, path) {
  if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, 'expected ' + min + '..' + max + ' entries');
}
function reference(value, allowed, path) {
  if (typeof value !== 'string' || !REF.test(value) || !Array.isArray(allowed) || !allowed.includes(value))
    invalid(path, 'unknown approved reference');
}
/** STAGED proposal; validates structure/references, never equivalence or permissions.
 * Trusted catalog: {gameId,rulesetPin,adapters:{mode:[componentRef]},sourceRefs,fixtureRefs}.
 * fixtureRefs name synthetic fixtures, never full stateKey values.
 */
export function parseModelProposal(jsonText, catalog) {
  if (typeof jsonText !== 'string' || jsonText.length > 65536) invalid('proposal', 'expected JSON text of at most 65536 characters');
  if (!catalog || !['beacon-steps', 'pocket-signals'].includes(catalog.gameId)) invalid('catalog.gameId', 'missing trusted game');
  text(catalog.rulesetPin, 256, 'catalog.rulesetPin');
  let proposal;
  try { proposal = JSON.parse(jsonText); } catch { invalid('proposal', 'invalid JSON; markdown fences are not accepted'); }
  record(proposal, ['schema','gameId','rulesetPin','classification','summary','changes','witnessCandidates'], 'proposal');
  if (proposal.schema !== SCHEMA) invalid('proposal.schema', 'unsupported schema');
  if (proposal.gameId !== catalog.gameId) invalid('proposal.gameId', 'does not match the selected game');
  if (proposal.rulesetPin !== catalog.rulesetPin) invalid('proposal.rulesetPin', 'stale or mismatched author-approved rules');
  if (!['equivalence-candidate','variant'].includes(proposal.classification)) invalid('proposal.classification', 'expected equivalence-candidate or variant');
  text(proposal.summary,1200,'proposal.summary'); list(proposal.changes,1,8,'proposal.changes');
  const changes = new Set();
  proposal.changes.forEach((change,index) => {
    const path = 'proposal.changes[' + index + ']';
    record(change,['adapter','componentRef','sourceRefs','rationale'],path);
    if (!MODES.has(change.adapter)) invalid(path + '.adapter','unsupported authoring adapter');
    const components = catalog.adapters && own(catalog.adapters,change.adapter) ? catalog.adapters[change.adapter] : null;
    reference(change.componentRef,components,path + '.componentRef');
    text(change.rationale,800,path + '.rationale'); list(change.sourceRefs,1,8,path + '.sourceRefs');
    const sources = new Set();
    change.sourceRefs.forEach((ref,i) => {
      reference(ref,catalog.sourceRefs,path + '.sourceRefs[' + i + ']');
      if (sources.has(ref)) invalid(path + '.sourceRefs','duplicate reference'); sources.add(ref);
    });
    const key = change.adapter + '\0' + change.componentRef;
    if (changes.has(key)) invalid(path,'duplicate adapter/component pair'); changes.add(key);
  });
  list(proposal.witnessCandidates,0,12,'proposal.witnessCandidates');
  const witnesses = new Set();
  proposal.witnessCandidates.forEach((witness,index) => {
    const path = 'proposal.witnessCandidates[' + index + ']';
    record(witness,['fixtureRef','check','viewer'],path);
    reference(witness.fixtureRef,catalog.fixtureRefs,path + '.fixtureRef');
    if (!['legal-actions','outcome','player-view'].includes(witness.check)) invalid(path + '.check','unsupported candidate check');
    if (witness.viewer !== 'public' && witness.viewer !== 0 && witness.viewer !== 1) invalid(path + '.viewer','expected public, 0, or 1');
    const key = witness.fixtureRef + '\0' + witness.check + '\0' + witness.viewer;
    if (witnesses.has(key)) invalid(path,'duplicate witness candidate'); witnesses.add(key);
  });
  return proposal;
}
