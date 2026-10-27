#!/usr/bin/env python3
"""Receive an actual private npm archive through its maintained launch path."""
import json,os,subprocess,tarfile,tempfile,hashlib,time,select,signal,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=Path(tempfile.mkdtemp(prefix='package-',dir=root/'receiving'))
receipt={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'output':str(out)}
def run(args,cwd=root,env=None,timeout=90):
 r=subprocess.run(args,cwd=cwd,env=env,text=True,capture_output=True,timeout=timeout)
 return r
server=None
try:
 receipt['source_commit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
 assert not subprocess.check_output(['git','status','--porcelain'],cwd=root,text=True).strip(),'Source must be committed and clean'
 packed=run(['npm','pack','--json','--pack-destination',str(out)])
 (out/'npm-pack.log').write_text(packed.stdout+packed.stderr)
 assert packed.returncode==0,packed.stderr
 manifest=None
 for i,c in enumerate(packed.stdout):
  if c!='[':continue
  try:
   obj=json.loads(packed.stdout[i:])
   if isinstance(obj,list) and obj and isinstance(obj[0],dict) and 'filename' in obj[0]:manifest=obj[0];break
  except json.JSONDecodeError:pass
 assert manifest,'npm pack did not return an archive manifest'
 archive=out/manifest['filename']
 receipt['archive']={'path':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'size':archive.stat().st_size,'file_count':len(manifest['files'])}
 dest=out/'unpacked';dest.mkdir()
 with tarfile.open(archive,'r:gz') as tar:
  for member in tar.getmembers():
   target=(dest/member.name).resolve()
   assert dest.resolve() in target.parents and not member.issym() and not member.islnk(),'Unsafe archive member'
   if member.isdir():target.mkdir(parents=True,exist_ok=True)
   else:
    assert member.isfile(),'Unexpected archive member'
    target.parent.mkdir(parents=True,exist_ok=True)
    with tar.extractfile(member) as stream:target.write_bytes(stream.read())
 package=dest/'package'
 required=['index.html','styles.css','server.mjs','src/app.js','src/games.js','src/adaptations.js','src/catalog.js','src/ruleset-pins.js','src/pack.js','scripts/write-ruleset-pins.mjs','scripts/browser-driver.mjs','scripts/browser-receive.mjs','scripts/continuous-receive.mjs','tests/server.test.mjs']
 for path in required:assert (package/path).is_file(),path
 for forbidden in ['receiving','node_modules','.env','.git']:assert not (package/forbidden).exists(),forbidden
 test=run(['npm','test'],cwd=package)
 (out/'package-native-tests.txt').write_text(test.stdout+test.stderr)
 assert test.returncode==0,test.stdout+test.stderr
 receipt['native_tests']={'exit_code':test.returncode,'passed':int(re.search(r'# pass (\d+)',test.stdout).group(1))}
 env=dict(os.environ,PORT='0')
 server=subprocess.Popen(['npm','start'],cwd=package,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
 boot=b'';url=None;deadline=time.time()+20
 while time.time()<deadline and server.poll() is None:
  ready,_,_=select.select([server.stdout],[],[],.2)
  if ready:
   chunk=os.read(server.stdout.fileno(),8192)
   if not chunk:break
   boot+=chunk
   match=re.search(rb'OPEN TABLE at (http://127\.0\.0\.1:\d+)',boot)
   if match:url=match.group(1).decode()+'/';break
 (out/'package-start.txt').write_bytes(boot)
 assert url,'Packaged npm start did not launch: '+boot.decode(errors='replace')
 receipt['entrypoint']={'command':'npm start','cwd':str(package),'url':url}
 env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_RECEIVING_DIR=str(out/'browser'))
 browser=run(['node','scripts/browser-receive.mjs'],cwd=package,env=env,timeout=90)
 (out/'package-browser.log').write_text(browser.stdout+browser.stderr)
 assert browser.returncode==0,browser.stdout+browser.stderr
 browser_receipt=json.loads((out/'browser/receipt.json').read_text())
 assert browser_receipt['ok']
 receipt['browser']={'ok':True,'checks':browser_receipt['checks'],'errors':browser_receipt['browserErrors']}
 continuous=run(['node','scripts/continuous-receive.mjs'],cwd=package,env=dict(env,OPEN_TABLE_CONTINUOUS_DIR=str(out/'continuous')),timeout=90)
 (out/'package-continuous.log').write_text(continuous.stdout+continuous.stderr)
 assert continuous.returncode==0,continuous.stdout+continuous.stderr
 continuous_receipt=json.loads((out/'continuous/receipt.json').read_text())
 assert continuous_receipt['ok']
 receipt['continuous']={'ok':True,'checks':continuous_receipt['checks'],'errors':continuous_receipt['browserErrors'],'sourceSha256':continuous_receipt['sourceSha256']}
 os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=10);server=None
 game=package/'src/games.js';original=game.read_bytes()
 try:
  game.write_bytes(original+b'\n// Receiving-only stale source negative control.\n')
  stale=run(['npm','start'],cwd=package,env=dict(os.environ,PORT='0'),timeout=10)
  (out/'stale-pin-start.txt').write_text(stale.stdout+stale.stderr)
  assert stale.returncode!=0 and 'Ruleset pins are missing or stale' in stale.stdout+stale.stderr
  assert 'OPEN TABLE at' not in stale.stdout
  receipt['stale_source_gate']={'exit_code':stale.returncode,'server_started':False}
 finally:game.write_bytes(original)
 receipt['ok']=True
except Exception as error:
 receipt['ok']=False;receipt['failure']=str(error)
 raise
finally:
 if server is not None:
  try:os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=10)
  except ProcessLookupError:pass
 receipt['finished_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
 (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt))
