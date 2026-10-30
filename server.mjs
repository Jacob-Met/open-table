import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {nemotronConfig,proposeAdaptation,ProposalError} from './src/nemotron.js';

const root=dirname(fileURLToPath(import.meta.url));
const paths=new Set(['/index.html','/styles.css','/src/app.js','/src/one-key.js','/src/saved-match.js','/src/games.js','/src/adaptations.js','/src/model-proposal.js','/src/author-request.js','/src/catalog.js','/src/catalog-data.js','/src/ruleset-pins.js','/src/pack.js','/src/designer-fixtures.js']);
const PROPOSE_PATH='/api/propose',MAX_PROPOSE_BYTES=8192;
// Live proposal: the server holds NEBIUS_API_KEY; the browser sends only the game and the need.
async function handlePropose(req,res,{env,fetchImpl}){
 const send=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{live:false,error:'Send the request as JSON.'});
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>MAX_PROPOSE_BYTES)return send(413,{live:false,error:'The request is too large.'});chunks.push(chunk);}
 let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{live:false,error:'The request is not valid JSON.'});}
 const config=nemotronConfig(env);
 if(!config.apiKey)return send(503,{live:false,error:'Nemotron is off. Set NEBIUS_API_KEY on the server to enable live proposals; the rest of OPEN TABLE works without it.'});
 try{return send(200,await proposeAdaptation({gameId:input?.gameId,accessGoal:input?.accessGoal},{config,fetchImpl}));}
 catch(error){
  if(!(error instanceof ProposalError))return send(500,{live:true,error:'The proposal could not be completed.'});
  const status={input:400,unconfigured:503,upstream:502,network:502,empty:502,invalid:422}[error.code]||500;
  return send(status,{live:error.code!=='unconfigured',error:error.message});
 }
}
export function createAppServer({env=process.env,fetchImpl=fetch}={}) {
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if(req.method==='POST'&&new URL(req.url,'http://localhost').pathname===PROPOSE_PATH){await handlePropose(req,res,{env,fetchImpl});return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Read-only application');return;}
  let path;
  try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad path');return;}
  if(path==='/')path='/index.html';
  if(!paths.has(path)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  try{
   const bytes=await readFile(resolve(root,'.'+path));
   const type=path.endsWith('.html')?'text/html':path.endsWith('.css')?'text/css':'text/javascript';
   res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Content-Length':bytes.length});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Asset unavailable');}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4287);
 if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be 0..65535');
 const server=createAppServer();
 server.listen(port,'127.0.0.1',()=>console.log('OPEN TABLE at http://127.0.0.1:'+server.address().port));
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
}
