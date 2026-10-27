import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EXPERIMENT_CASE_IDS,getExperimentCase,makeModelRequest,deterministicBaseline,proposalComparison} from '../src/model-experiment.js';
import {getCatalog} from '../src/catalog.js';
import {parseModelProposal} from '../src/model-proposal.js';
import {checkAdaptation} from '../src/adaptations.js';
const dir=new URL('../receiving/model-development/',import.meta.url);await mkdir(dir,{recursive:true});
const rows=[];
for(const id of EXPERIMENT_CASE_IDS){
 const task=getExperimentCase(id);if(task.split!=='development')continue;
 const request=makeModelRequest(id),candidate=deterministicBaseline(id),catalog=getCatalog(task.gameId);
 const parsed=parseModelProposal(JSON.stringify(candidate),catalog);
 const checks=[...new Set(parsed.changes.map(c=>c.adapter))].map(adapter=>({adapter,...checkAdaptation(task.gameId,adapter)}));
 const row={id,source:'deterministic-baseline',request,proposal:parsed,comparison:proposalComparison(id,parsed),checks};
 rows.push(row);await writeFile(new URL(id+'.json',dir),JSON.stringify(row,null,2)+'\n');
}
const sourceHash=createHash('sha256').update(await readFile(new URL('../src/model-experiment.js',import.meta.url))).digest('hex');
const result={sourceHash,providerRequests:0,reservedCasesExecuted:false,rows};
await writeFile(new URL('receipt.json',dir),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceHash,providerRequests:0,reservedCasesExecuted:false,development:rows.map(r=>({id:r.id,comparison:r.comparison,checks:r.checks.map(c=>({adapter:c.adapter,ok:c.ok,states:c.states,transitions:c.transitions}))}))}));
