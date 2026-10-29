import {createHash} from 'node:crypto';
import {mkdir,readFile,stat,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as esbuild from 'esbuild';

const VERSION='0.28.2';
const INTEGRITY='sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config={entry:'src/app.js',bundle:true,platform:'browser',format:'iife',target:['es2020'],charset:'utf8',minify:false,sourcemap:false,legalComments:'inline',supported:{'inline-script':true}};
const fail=message=>{throw new Error(message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function stable(value){
 if(Array.isArray(value))return value.map(stable);
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
 return value;
}
const json=value=>JSON.stringify(stable(value),null,2)+'\n';
function relativeInput(filename){
 const relative=path.relative(root,path.resolve(root,filename));
 if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))fail('Input outside project: '+filename);
 return relative.split(path.sep).join('/');
}
function replaceOnce(source,needle,replacement){
 const first=source.indexOf(needle);
 if(first<0||source.indexOf(needle,first+needle.length)>=0)fail('Expected one template marker: '+needle);
 return source.slice(0,first)+replacement+source.slice(first+needle.length);
}
async function absent(filename){
 try{await stat(filename);}catch(e){if(e.code==='ENOENT')return;throw e;}
 fail('Refusing to overwrite output: '+filename);
}
function checkPins(){
 const p=spawnSync(process.execPath,['scripts/write-ruleset-pins.mjs','--check'],{cwd:root,encoding:'utf8',shell:false,maxBuffer:4*1024*1024});
 if(p.error)throw p.error;
 if(p.status!==0)fail('Source-pin validation failed.\n'+(p.stderr||p.stdout||'Exit '+p.status));
 const report=JSON.parse(p.stdout);
 if(report.format!=='open-table.ruleset-binding.v1'||report.checked!==true)fail('Unexpected source-pin report.');
 return report;
}
async function main(){
 const args=process.argv.slice(2);
 if(args.length!==2||args[0]!=='--out-dir'||!args[1]||args[1].startsWith('--'))fail('Usage: node scripts/build-offline.mjs --out-dir /path/to/output');
 const outDir=path.resolve(args[1]),relativeOut=path.relative(root,outDir).split(path.sep).join('/');
 if(outDir===root||['src','node_modules','scripts','tests','docs'].some(p=>relativeOut===p||relativeOut.startsWith(p+'/')))fail('Use a separate build-output directory.');
 if(esbuild.version!==VERSION)fail('Expected esbuild '+VERSION+'; found '+esbuild.version);
 const captured=new Map();
 async function capture(filename){
  const relative=relativeInput(filename),bytes=await readFile(path.join(root,relative)),prior=captured.get(relative);
  if(prior&&!prior.equals(bytes))fail('Input changed during build: '+relative);
  captured.set(relative,bytes);return bytes;
 }
 const pkg=JSON.parse(await capture('package.json')),lock=JSON.parse(await capture('npm-shrinkwrap.json'));
 if(typeof pkg.version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version))fail('Package version is not filename-safe.');
 if(pkg.devDependencies?.esbuild!==VERSION)fail('Pin esbuild exactly in devDependencies.');
 const locked=lock.packages?.['node_modules/esbuild'];
 if(locked?.version!==VERSION||locked?.integrity!==INTEGRITY||lock.packages?.['']?.devDependencies?.esbuild!==VERSION)fail('Unexpected esbuild pin in npm-shrinkwrap.json.');
 await capture('scripts/build-offline.mjs');await capture('scripts/write-ruleset-pins.mjs');
 const pinReport=checkPins();await capture('src/ruleset-pins.js');
 for(const [filename,digest] of Object.entries(pinReport.sourceDigests)){if(sha(await capture(filename))!==digest)fail('Source binding changed before capture: '+filename);}
 const index=(await capture('index.html')).toString('utf8'),css=(await capture('styles.css')).toString('utf8');
 if(/@import\b|url\s*\(/i.test(css)||/<\/style/i.test(css))fail('Stylesheet contains a resource or unsafe inline terminator.');
 const loaded=new Set();
 const result=await esbuild.build({
  absWorkingDir:root,entryPoints:[config.entry],bundle:config.bundle,platform:config.platform,format:config.format,target:config.target,
  charset:config.charset,minify:config.minify,sourcemap:config.sourcemap,legalComments:config.legalComments,supported:config.supported,
  write:false,metafile:true,logLevel:'silent',outfile:'offline-bundle.js',
  plugins:[{name:'capture-offline-inputs',setup(build){
   build.onLoad({filter:/.*/,namespace:'file'},async args=>{
    const relative=relativeInput(args.path),extension=path.extname(relative);
    if(!relative.startsWith('src/'))fail('Browser dependency outside src/: '+relative);
    const loader=extension==='.json'?'json':['.js','.mjs'].includes(extension)?'js':null;
    if(!loader)fail('Unsupported browser input: '+relative);
    const contents=await capture(relative);loaded.add(relative);
    return {contents,loader,resolveDir:path.dirname(args.path)};
   });
  }}]
 });
 if(result.warnings.length)fail('Bundling warnings: '+result.warnings.map(x=>x.text).join('\n'));
 const outputs=Object.values(result.metafile.outputs);
 if(result.outputFiles.length!==1||outputs.length!==1||outputs[0].cssBundle||outputs[0].imports.length)fail('Expected one self-contained JavaScript output.');
 for(const [filename,metadata] of Object.entries(result.metafile.inputs)){
  const relative=relativeInput(filename);
  if(!loaded.has(relative)||metadata.imports.some(x=>x.external))fail('Uncaptured or external browser dependency: '+relative);
 }
 const bundle=result.outputFiles[0].text;
 if(/<\/script/i.test(bundle))fail('Unsafe script terminator in bundle.');
 if(json(checkPins())!==json(pinReport))fail('Source pins changed during bundling.');
 for(const [relative,original] of captured)if(!(await readFile(path.join(root,relative))).equals(original))fail('Input changed during build: '+relative);
 const inputs=Object.fromEntries([...captured].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,bytes])=>[p,{bytes:bytes.length,sha256:sha(bytes)}]));
 const information={format:'open-table.offline-build.v1',packageVersion:pkg.version,bundler:{name:'esbuild',version:VERSION},configuration:config,sourceBinding:pinReport,inputs};
 const embedded=json(information).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
 let html=replaceOnce(index,'<link rel="stylesheet" href="/styles.css">','<style>\n'+css+'\n</style>');
 html=replaceOnce(html,'<script type="module" src="/src/app.js"></script>','');
 // Classic inline code runs after #app exists; the original module deferred.
 html=replaceOnce(html,'</body>','<script type="application/json" id="open-table-offline-build">\n'+embedded+'</script>\n<script>\n'+bundle+'\n</script>\n</body>');
 if(/<script\b[^>]*\bsrc\s*=/i.test(html)||/<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i.test(html))fail('External script or stylesheet remains.');
 const htmlBytes=Buffer.from(html,'utf8'),htmlName='open-table-'+pkg.version+'.html';
 const manifestBytes=Buffer.from(json({...information,output:{file:htmlName,bytes:htmlBytes.length,sha256:sha(htmlBytes)}}),'utf8');
 const htmlPath=path.join(outDir,htmlName),manifestPath=path.join(outDir,'manifest.json');
 await absent(htmlPath);await absent(manifestPath);await mkdir(outDir,{recursive:true});
 const created=[];
 try{
  await writeFile(htmlPath,htmlBytes,{flag:'wx'});created.push(htmlPath);
  await writeFile(manifestPath,manifestBytes,{flag:'wx'});created.push(manifestPath);
 }catch(e){await Promise.allSettled(created.map(p=>unlink(p)));throw e;}
 process.stdout.write(json({format:'open-table.offline-build-result.v1',packageVersion:pkg.version,outputs:[
  {file:htmlName,bytes:htmlBytes.length,sha256:sha(htmlBytes)},{file:'manifest.json',bytes:manifestBytes.length,sha256:sha(manifestBytes)}
 ]}));
}
main().catch(error=>{process.stderr.write('Offline build failed: '+error.message+'\n');process.exitCode=1;});
