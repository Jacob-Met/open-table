import {catalogDefinition} from './catalog-data.js';
import {RULESET_PINS} from './ruleset-pins.js';
export function getCatalog(gameId){
 const d=catalogDefinition(gameId),rulesetPin=RULESET_PINS[gameId];
 if(typeof rulesetPin!=='string'||!/^sha256:[a-f0-9]{64}$/.test(rulesetPin))throw new Error('Ruleset pin is unavailable. Generate and verify the current source binding before serving.');
 return {gameId,title:d.title,rulesetPin,rules:d.rules,components:d.components,adapters:d.adapters,
  sourceRefs:d.rules.map(r=>r.ref),fixtureRefs:d.fixtures.map(f=>f.ref),fixtures:d.fixtures};
}
