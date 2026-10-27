import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=dirname(fileURLToPath(import.meta.url));
const paths=new Set(['/index.html','/styles.css','/src/app.js','/src/games.js','/src/adaptations.js','/src/model-proposal.js','/src/catalog.js','/src/catalog-data.js','/src/ruleset-pins.js','/src/pack.js','/src/designer-fixtures.js']);
export function createAppServer() {
 return createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
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
