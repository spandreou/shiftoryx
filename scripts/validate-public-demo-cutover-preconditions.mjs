// Validation only. No cloud discovery, API client, mutation mode or deployment.
import {readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {parseStrictJson} from './lib/auditExceptionPolicy.ts';
import {DEMO_IDENTITY,DEMO_HOSTS,exactSet,byteDigest} from './lib/demoObservation.ts';
import {CutoverError,CUTOVER_ROOT,loadSealedFile,assertQualificationHead,captureCutoverContext,safeArtifactReader,
  readMaintenanceArtifact,validateCutoverPreconditions} from './lib/demoCutover.ts';
const allowed=['qualification-sha','expected-project','expected-project-number','expected-bucket','expected-aliases',
  'recovery','recovery-sha256','dossier','dossier-sha256','current-dossier','current-dossier-sha256',
  'target','target-sha256','capabilities','capabilities-sha256','maintenance','maintenance-sha256'];
try{
  const args=process.argv.slice(2),options={};
  if(args.length%2!==0)throw new CutoverError('ARGUMENTS');
  for(let i=0;i<args.length;i+=2){const key=args[i];if(!key.startsWith('--')||!allowed.includes(key.slice(2))||Object.hasOwn(options,key.slice(2))||!args[i+1]||args[i+1].startsWith('--'))throw new CutoverError('ARGUMENTS');options[key.slice(2)]=args[i+1];}
  for(const key of allowed.slice(0,7))if(!options[key])throw new CutoverError('ARGUMENTS');
  if(options['expected-project']!==DEMO_IDENTITY.projectId||options['expected-project-number']!==DEMO_IDENTITY.projectNumber||options['expected-bucket']!==DEMO_IDENTITY.bucket)throw new CutoverError('EXPECTED_IDENTITY');
  const aliases=options['expected-aliases'].split(',');exactSet(aliases,DEMO_HOSTS);
  assertQualificationHead(CUTOVER_ROOT,options['qualification-sha']);
  const loaded=[];
  const input=(key)=>{const pair=loadSealedFile(options[key],options[key+'-sha256']);loaded.push({path:options[key],...pair});return pair;};
  const recovery=input('recovery');
  if(parseStrictJson(recovery.bytes.toString('utf8')).status!=='VERIFIED')throw new CutoverError('RECOVERY_NOT_VERIFIED');
  for(const key of allowed.slice(7))if(!options[key])throw new CutoverError('ARGUMENTS');
  const contextSha256=captureCutoverContext(CUTOVER_ROOT);
  const result=validateCutoverPreconditions({qualificationSha:options['qualification-sha'],expected:{...DEMO_IDENTITY,aliases},
    recovery,observation:input('dossier'),currentObservation:input('current-dossier'),target:input('target'),capabilities:input('capabilities'),
    maintenance:readMaintenanceArtifact(options.maintenance,options['maintenance-sha256']),
    targetArtifact:safeArtifactReader(dirname(options.target)),contextSha256,
    reviewedRuleDigests:{firestore:byteDigest(readFileSync(new URL('../firestore.demo.rules',import.meta.url))),storage:byteDigest(readFileSync(new URL('../storage.demo.rules',import.meta.url)))} });
  for(const pair of loaded)if(byteDigest(readFileSync(pair.path))!==pair.sha256)throw new CutoverError('FILE_CHANGED');
  readMaintenanceArtifact(options.maintenance,options['maintenance-sha256']);
  if(captureCutoverContext(CUTOVER_ROOT)!==contextSha256)throw new CutoverError('CONTEXT_CHANGED');
  assertQualificationHead(CUTOVER_ROOT,options['qualification-sha']);
  console.log('CUTOVER_PRECONDITIONS_LOCAL '+JSON.stringify(result));
}catch(error){
  const code=typeof error?.code==='string'&&/^(CUTOVER|OBS)_\w+$/.test(error.code)?error.code:'CUTOVER_EVIDENCE_UNAVAILABLE';
  console.error('CUTOVER_PRECONDITIONS_FAIL code='+code);process.exitCode=1;
}
