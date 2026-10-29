#!/usr/bin/env python3
"""Receive an actual private npm archive through its maintained launch path."""
import json,os,subprocess,tarfile,tempfile,hashlib,time,select,signal,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
(root/'receiving').mkdir(parents=True,exist_ok=True)
out=Path(tempfile.mkdtemp(prefix='package-',dir=root/'receiving'))
receipt={'started_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'output':str(out)}
def run(args,cwd=root,env=None,timeout=90):
 r=subprocess.run(args,cwd=cwd,env=env,text=True,capture_output=True,timeout=timeout)
 return r
server=None
def receive_reselect(label,extra,expected_checks,artifact_hash=None):
 assert (package/'scripts/workshop-reselect-receive.mjs').read_bytes()==(root/'scripts/workshop-reselect-receive.mjs').read_bytes(),'Packaged reselect receiver differs from committed source'
 result=run(['node','scripts/workshop-reselect-receive.mjs','--source',str(package),'--output',str(out/label)]+extra,cwd=package,timeout=120)
 (out/(label+'.log')).write_text(result.stdout+result.stderr)
 assert result.returncode==0,result.stdout+result.stderr
 evidence=json.loads((out/label/'receipt.json').read_text())
 assert evidence['schema']=='open-table.workshop-reselect-receipt.v1' and evidence['pass'] is True
 assert len(evidence['checks'])==expected_checks and all(c['pass'] is True for c in evidence['checks'])
 assert evidence['errors']==[]
 for path in ['src/app.js','server.mjs','scripts/browser-driver.mjs']:
  expected=hashlib.sha256((package/path).read_bytes()).hexdigest()
  assert evidence['hashes'][path]==evidence['finalHashes'][path]==expected
  assert (package/path).read_bytes()==(root/path).read_bytes(),'Receiver input differs from committed source: '+path
 assert evidence['offline'] is (artifact_hash is not None)
 if artifact_hash is not None:
  assert evidence['artifactHash']==evidence['finalArtifactHash']==artifact_hash
 receipt[label]={'exit_code':result.returncode,'pass':True,'evidence':str(out/label/'receipt.json'),'checks':evidence['checks'],'hashes':evidence['hashes'],'browserVersion':evidence['browserVersion'],'source_hash_agreement':True}
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
 required=['index.html','styles.css','server.mjs','src/app.js','src/one-key.js','src/games.js','src/adaptations.js','src/catalog.js','src/ruleset-pins.js','src/pack.js','scripts/write-ruleset-pins.mjs','scripts/browser-driver.mjs','scripts/browser-receive.mjs','scripts/browser-focus.mjs','scripts/pack-import-browser.mjs','scripts/continuous-receive.mjs','scripts/continuous-boundary-receive.mjs','scripts/space-confirm-receive.mjs','scripts/visibility-receive.mjs','scripts/visibility-lifecycle-receive.mjs','docs/HIDDEN_SCANNING.md','scripts/one-key-receive.mjs','scripts/one-key-layout-receive.mjs','scripts/workshop-receive.mjs','scripts/workshop-reselect-receive.mjs','docs/ONE_KEY_PLAY.md','docs/OFFLINE_PLAY.md','scripts/build-offline.mjs','scripts/offline-receive.mjs','npm-shrinkwrap.json','tests/server.test.mjs']
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
 focus=run(['node','scripts/browser-focus.mjs',url,str(out/'focus')],cwd=package,timeout=90)
 (out/'package-focus.log').write_text(focus.stdout+focus.stderr)
 assert focus.returncode==0,focus.stdout+focus.stderr
 focus_receipt=json.loads((out/'focus/receipt.json').read_text())
 assert focus_receipt['passed'] is True
 receipt['focus']={'exit_code':focus.returncode,'passed':True,'checks':[check['name'] for check in focus_receipt['checks']]}
 env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_RECEIVING_DIR=str(out/'pack-import'))
 pack_import=run(['node','scripts/pack-import-browser.mjs'],cwd=package,env=env,timeout=90)
 (out/'package-pack-import.log').write_text(pack_import.stdout+pack_import.stderr)
 assert pack_import.returncode==0,pack_import.stdout+pack_import.stderr
 pack_import_receipt=json.loads((out/'pack-import/pack-import-receipt.json').read_text())
 assert pack_import_receipt['passed'] is True
 receipt['pack_import']={'exit_code':pack_import.returncode,'passed':True,'checks':[case['name'] for case in pack_import_receipt['cases']]}
 app_sha256=hashlib.sha256((package/'src/app.js').read_bytes()).hexdigest()
 continuous=run(['node','scripts/continuous-receive.mjs'],cwd=package,env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_CONTINUOUS_DIR=str(out/'continuous')),timeout=90)
 (out/'package-continuous.log').write_text(continuous.stdout+continuous.stderr)
 assert continuous.returncode==0,continuous.stdout+continuous.stderr
 continuous_receipt=json.loads((out/'continuous/receipt.json').read_text())
 assert continuous_receipt['schema']=='open-table.continuous-receiving.v1'
 assert continuous_receipt['ok'] is True and len(continuous_receipt['checks'])==5
 assert continuous_receipt['browserErrors']==[]
 assert continuous_receipt['sourceSha256']==app_sha256,'Continuous course source differs from extracted app'
 receipt['continuous']={'exit_code':continuous.returncode,'schema':continuous_receipt['schema'],'ok':True,'checks':continuous_receipt['checks'],'errors':continuous_receipt['browserErrors'],'sourceSha256':continuous_receipt['sourceSha256'],'packageAppSha256':app_sha256,'source_hash_agreement':True}
 boundary=run(['node','scripts/continuous-boundary-receive.mjs'],cwd=package,env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_BOUNDARY_DIR=str(out/'continuous-boundary')),timeout=90)
 (out/'package-continuous-boundary.log').write_text(boundary.stdout+boundary.stderr)
 assert boundary.returncode==0,boundary.stdout+boundary.stderr
 boundary_receipt=json.loads((out/'continuous-boundary/receipt.json').read_text())
 assert boundary_receipt['suite']=='continuous-boundary' and boundary_receipt['pass'] is True
 assert [course['name'] for course in boundary_receipt['courses']]==['key-release','obsolete-timer','transcript-parity']
 assert all(course['pass'] is True for course in boundary_receipt['courses']) and boundary_receipt['browserErrors']==[]
 assert boundary_receipt['appSHA256']==boundary_receipt['servedAppSHA256']==app_sha256,'Boundary course or served source differs from extracted app'
 receipt['continuous_boundary']={'exit_code':boundary.returncode,'suite':boundary_receipt['suite'],'pass':True,'courses':[course['name'] for course in boundary_receipt['courses']],'errors':boundary_receipt['browserErrors'],'appSHA256':boundary_receipt['appSHA256'],'servedAppSHA256':boundary_receipt['servedAppSHA256'],'packageAppSha256':app_sha256,'source_hash_agreement':True}
 space=run(['node','scripts/space-confirm-receive.mjs'],cwd=package,env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_SPACE_DIR=str(out/'space-confirm')),timeout=90)
 (out/'package-space-confirm.log').write_text(space.stdout+space.stderr)
 assert space.returncode==0,space.stdout+space.stderr
 space_receipt=json.loads((out/'space-confirm/receipt.json').read_text())
 assert space_receipt['schema']=='open-table.space-confirm-receiving.v1' and space_receipt['ok'] is True
 assert len(space_receipt['checks'])==9 and space_receipt['browserErrors']==[]
 assert space_receipt['appSHA256']==space_receipt['servedAppSHA256']==app_sha256,'Space course or served source differs from extracted app'
 receipt['space_confirm']={'exit_code':space.returncode,'schema':space_receipt['schema'],'ok':True,'checks':space_receipt['checks'],'errors':space_receipt['browserErrors'],'appSHA256':space_receipt['appSHA256'],'servedAppSHA256':space_receipt['servedAppSHA256'],'packageAppSha256':app_sha256,'source_hash_agreement':True}
 visibility=run(['node','scripts/visibility-receive.mjs'],cwd=package,env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_VISIBILITY_DIR=str(out/'visibility')),timeout=120)
 (out/'visibility.log').write_text(visibility.stdout+visibility.stderr)
 assert visibility.returncode==0,visibility.stdout+visibility.stderr
 visibility_receipt=json.loads((out/'visibility/receipt.json').read_text())
 assert visibility_receipt['schema']=='open-table.visibility-receiving.v1' and visibility_receipt['status']=='passed'
 assert len(visibility_receipt['groups'])==6 and all(g['status']=='passed' for g in visibility_receipt['groups'])
 assert visibility_receipt['browserErrors']==[]
 assert visibility_receipt['source']['servedAppSha256']==app_sha256,'Visibility course source differs from extracted app'
 receipt['visibility']={'exit_code':visibility.returncode,'status':'passed','checks':[g['name'] for g in visibility_receipt['groups']],'source':visibility_receipt['source'],'source_hash_agreement':True,'errors':visibility_receipt['browserErrors']}
 lifecycle=run(['node','scripts/visibility-lifecycle-receive.mjs'],cwd=package,env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_VISIBILITY_LIFECYCLE_DIR=str(out/'visibility-lifecycle')),timeout=90)
 (out/'visibility-lifecycle.log').write_text(lifecycle.stdout+lifecycle.stderr)
 assert lifecycle.returncode==0,lifecycle.stdout+lifecycle.stderr
 lifecycle_receipt=json.loads((out/'visibility-lifecycle/receipt.json').read_text())
 assert lifecycle_receipt['schema']=='open-table.visibility-lifecycle-receiving.v1' and lifecycle_receipt['ok'] is True
 assert len(lifecycle_receipt['checks'])==3 and all(g['ok'] is True for g in lifecycle_receipt['checks'])
 assert lifecycle_receipt['browserErrors']==[]
 assert lifecycle_receipt['servedAppSha256']==lifecycle_receipt['sourceAppSha256']==app_sha256,'Lifecycle course source differs from extracted app'
 receipt['visibility_lifecycle']={'exit_code':lifecycle.returncode,'ok':True,'checks':[g['name'] for g in lifecycle_receipt['checks']],'source_hash_agreement':True,'errors':lifecycle_receipt['browserErrors']}
 one_key=run(['node','scripts/one-key-receive.mjs'],cwd=package,env=dict(os.environ,OPEN_TABLE_RECEIVING_URL=url,OPEN_TABLE_ONE_KEY_DIR=str(out/'one-key')),timeout=420)
 (out/'package-one-key.log').write_text(one_key.stdout+one_key.stderr)
 assert one_key.returncode==0,one_key.stdout+one_key.stderr
 one_key_receipt=json.loads((out/'one-key/receipt.json').read_text())
 assert one_key_receipt['schema']=='open-table.one-key-receiving.v1' and one_key_receipt['ok'] is True
 assert len(one_key_receipt['checks'])==16 and len(one_key_receipt['observations'])==16
 assert all(case['passed'] is True for case in one_key_receipt['observations']) and one_key_receipt['browserErrors']==[]
 for name,path in [('app','src/app.js'),('controller','src/one-key.js')]:
  expected=hashlib.sha256((package/path).read_bytes()).hexdigest()
  assert one_key_receipt['hashes'][name]['source']==one_key_receipt['hashes'][name]['served']==one_key_receipt['hashes'][name]['pin']==expected,'One-key source/served/pin differs from extracted package'
 receipt['one_key']={'exit_code':one_key.returncode,'schema':one_key_receipt['schema'],'ok':True,'checks':one_key_receipt['checks'],'hashes':one_key_receipt['hashes'],'errors':one_key_receipt['browserErrors'],'source_hash_agreement':True}
 workshop=run(['node','scripts/workshop-receive.mjs','--url',url,'--output',str(out/'workshop')],cwd=package,timeout=120)
 (out/'package-workshop.log').write_text(workshop.stdout+workshop.stderr)
 assert workshop.returncode==0,workshop.stdout+workshop.stderr
 workshop_receipt=json.loads((out/'workshop/receipt.json').read_text())
 assert workshop_receipt['schema']=='open-table.workshop-receiving.v1' and workshop_receipt['ok'] is True
 assert len(workshop_receipt['checks'])==5 and len(workshop_receipt['observations'])==5
 assert all(case['passed'] is True for case in workshop_receipt['observations'])
 assert workshop_receipt['browserErrors']==[] and workshop_receipt['forbiddenRequests']==[] and workshop_receipt['browserClosed'] is True
 receipt['workshop']={'exit_code':workshop.returncode,'schema':workshop_receipt['schema'],'ok':True,'checks':workshop_receipt['checks'],'errors':workshop_receipt['browserErrors'],'forbiddenRequests':workshop_receipt['forbiddenRequests']}
 receive_reselect('workshop-reselect',['--url',url],20)
 layout=run(['node','scripts/one-key-layout-receive.mjs','--url',url,'--output',str(out/'one-key-layout')],cwd=package,timeout=180)
 (out/'package-one-key-layout.log').write_text(layout.stdout+layout.stderr)
 assert layout.returncode==0,layout.stdout+layout.stderr
 layout_receipt=json.loads((out/'one-key-layout/receipt.json').read_text())
 assert layout_receipt['format']=='open-table.one-key-layout-receiving.v1' and layout_receipt['status']=='passed'
 assert len(layout_receipt['checks'])==7 and all(case['status']=='passed' for case in layout_receipt['checks'])
 assert layout_receipt['errors']==[]
 receipt['one_key_layout']={'exit_code':layout.returncode,'format':layout_receipt['format'],'status':'passed','checks':layout_receipt['checks'],'errors':layout_receipt['errors'],'localInputs':layout_receipt['localInputs'],'observations':layout_receipt['observations']}
 os.killpg(server.pid,signal.SIGTERM);server.wait(timeout=10);server=None
 install=run(['npm','ci','--include=dev','--ignore-scripts','--no-audit','--no-fund'],cwd=package,timeout=120)
 (out/'offline-build-install.log').write_text(install.stdout+install.stderr)
 assert install.returncode==0,install.stdout+install.stderr
 offline_directory=out/'offline-built'
 offline_build=run(['npm','run','build:offline','--','--out-dir',str(offline_directory)],cwd=package,timeout=60)
 (out/'offline-build.log').write_text(offline_build.stdout+offline_build.stderr)
 assert offline_build.returncode==0,offline_build.stdout+offline_build.stderr
 offline_manifest=json.loads((offline_directory/'manifest.json').read_text())
 assert offline_manifest['format']=='open-table.offline-build.v1'
 offline_file=offline_directory/offline_manifest['output']['file']
 assert offline_file.stat().st_size==offline_manifest['output']['bytes']
 assert hashlib.sha256(offline_file.read_bytes()).hexdigest()==offline_manifest['output']['sha256']
 for path,expected in offline_manifest['inputs'].items():
  assert (package/path).read_bytes()==(root/path).read_bytes(),'Packaged build input differs from committed source: '+path
  assert hashlib.sha256((package/path).read_bytes()).hexdigest()==expected['sha256']
 offline_env=dict(os.environ,OPEN_TABLE_RECEIVING_FILE=str(offline_file),OPEN_TABLE_OFFLINE_MANIFEST=str(offline_directory/'manifest.json'),OPEN_TABLE_OFFLINE_DIR=str(out/'offline-file'))
 offline_env.pop('OPEN_TABLE_RECEIVING_URL',None)
 offline=run(['node','scripts/offline-receive.mjs'],cwd=package,env=offline_env,timeout=90)
 (out/'offline-file.log').write_text(offline.stdout+offline.stderr)
 assert offline.returncode==0,offline.stdout+offline.stderr
 offline_receipt=json.loads((out/'offline-file/receipt.json').read_text())
 assert offline_receipt['ok'] is True and len(offline_receipt['checks'])==11
 assert offline_receipt['browserErrors']==[] and all(not item['forbidden'] for item in offline_receipt['browserRuns'])
 receipt['offline_build']={'install_exit_code':install.returncode,'build_exit_code':offline_build.returncode,'manifest':offline_manifest,'source_input_agreement':True}
 receipt['offline']={'exit_code':offline.returncode,'ok':True,'checks':offline_receipt['checks'],'artifact':offline_receipt['artifact'],'errors':offline_receipt['browserErrors'],'browser_runs':offline_receipt['browserRuns']}
 receive_reselect('offline-workshop-reselect',['--file',str(offline_file)],21,offline_manifest['output']['sha256'])
 offline_visibility=run(['node','scripts/visibility-receive.mjs'],cwd=package,env=dict(offline_env,OPEN_TABLE_VISIBILITY_DIR=str(out/'offline-visibility')),timeout=120)
 (out/'offline-visibility.log').write_text(offline_visibility.stdout+offline_visibility.stderr)
 assert offline_visibility.returncode==0,offline_visibility.stdout+offline_visibility.stderr
 offline_visibility_receipt=json.loads((out/'offline-visibility/receipt.json').read_text())
 assert offline_visibility_receipt['schema']=='open-table.visibility-receiving.v1' and offline_visibility_receipt['status']=='passed'
 assert len(offline_visibility_receipt['groups'])==6 and all(g['status']=='passed' for g in offline_visibility_receipt['groups'])
 assert offline_visibility_receipt['browserErrors']==[] and offline_visibility_receipt['offline'] is True
 assert offline_visibility_receipt['source']['fileSha256']==offline_manifest['output']['sha256']
 offline_visibility_forbidden=[r for r in offline_visibility_receipt['requests'] if not r['url'].startswith(('data:','blob:','about:')) and r['url'].split('#')[0].split('?')[0]!=offline_file.as_uri()]
 assert offline_visibility_forbidden==[],'Unexpected offline visibility dependency'
 receipt['offline_visibility']={'exit_code':offline_visibility.returncode,'status':'passed','checks':[g['name'] for g in offline_visibility_receipt['groups']],'source':offline_visibility_receipt['source'],'artifact_hash_agreement':True,'errors':offline_visibility_receipt['browserErrors'],'forbidden_requests':offline_visibility_forbidden}
 game=package/'src/games.js';original=game.read_bytes()
 try:
  game.write_bytes(original+b'\n// Receiving-only stale source negative control.\n')
  stale=run(['npm','start'],cwd=package,env=dict(os.environ,PORT='0'),timeout=10)
  (out/'stale-pin-start.txt').write_text(stale.stdout+stale.stderr)
  assert stale.returncode!=0 and 'Ruleset pins are missing or stale' in stale.stdout+stale.stderr
  assert 'OPEN TABLE at' not in stale.stdout
  receipt['stale_source_gate']={'exit_code':stale.returncode,'server_started':False}
 finally:game.write_bytes(original)
 controller=package/'src/one-key.js';original_controller=controller.read_bytes()
 try:
  controller.write_bytes(original_controller+b'\n// Receiving-only stale controller negative control.\n')
  stale_controller=run(['npm','start'],cwd=package,env=dict(os.environ,PORT='0'),timeout=10)
  (out/'stale-controller-start.txt').write_text(stale_controller.stdout+stale_controller.stderr)
  assert stale_controller.returncode!=0 and 'Ruleset pins are missing or stale' in stale_controller.stdout+stale_controller.stderr
  assert 'OPEN TABLE at' not in stale_controller.stdout
  receipt['stale_controller_gate']={'exit_code':stale_controller.returncode,'server_started':False}
 finally:controller.write_bytes(original_controller)
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

