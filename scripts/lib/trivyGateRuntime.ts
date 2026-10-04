import {readFileSync,readdirSync,lstatSync,realpathSync,mkdirSync,writeFileSync,mkdtempSync,existsSync,statSync} from 'node:fs';
import {join,dirname,isAbsolute,resolve,relative,delimiter,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ROOT,captureReviewedContext,readJson,assertReviewedContext} from './auditGateRuntime.ts';
import {GateError} from './auditExceptionPolicy.ts';
import {validateScanSeal,validateTrivyProcess,validateTrivyPair,type TrivyEvidence,type ScanReceipt} from './trivyAuditPolicy.ts';
const VERSION='0.70.0';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function environment(){return Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOME|HOMEDRIVE|HOMEPATH)$/i.test(k)));}
function inventory(root:string):Map<string,Buffer>{
 const r=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,env:environment(),shell:false,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
 if(r.error||r.signal||r.status!==0)throw new GateError('TRIVY_INVENTORY_UNAVAILABLE');
 const paths=[...new Set(r.stdout.split('\0').filter(Boolean))].sort();
 if(!paths.length||paths.length>2000)throw new GateError('TRIVY_INVENTORY_LIMIT');
 const files=new Map<string,Buffer>();let bytes=0;
 for(const path of paths){
  if(isAbsolute(path)||path.split(/[\\/]/).includes('..')||/(^|\/)\.trivyignore|(^|\/)trivy\.(yaml|yml|json)$/.test(path))throw new GateError('TRIVY_INPUT_PATH');
  const file=resolve(root,path),rel=relative(realpathSync(root),realpathSync(file));
  if(!rel||rel.startsWith('..')||isAbsolute(rel)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw new GateError('TRIVY_INPUT_PATH');
  const data=readFileSync(file);bytes+=data.length;
  if(data.length>32*1024*1024||bytes>64*1024*1024)throw new GateError('TRIVY_INVENTORY_LIMIT');
  files.set(path,data);
 }
 return files;
}
const seal=(files:Map<string,Buffer>)=>Object.fromEntries([...files].map(([p,b])=>[p,sha(b)]));
function binary():string{
 const explicit=process.env.SHIFTORYX_TRIVY_BIN;
 const paths=Object.entries(process.env).find(([k])=>k.toUpperCase()==='PATH')?.[1]?.split(delimiter)||[];
 const candidates=explicit===undefined?paths.map(p=>join(p,process.platform==='win32'?'trivy.exe':'trivy')):[explicit];
 const found=candidates.find(p=>isAbsolute(p)&&existsSync(p)&&statSync(p).isFile());
 if(!found)throw new GateError('TRIVY_EXECUTABLE_RESOLUTION');
 const actual=realpathSync(found);if(!['trivy','trivy.exe'].includes(basename(actual)))throw new GateError('TRIVY_EXECUTABLE_RESOLUTION');
 return actual;
}
export function runTrivyGate():{acceptedFindings:number;directory:string}{
 const npmPolicy=readJson(join(ROOT,'security/npm-audit-exceptions.json'));
 assertReviewedContext(ROOT,npmPolicy);
 const files=inventory(ROOT),before=seal(files);
 const directory=mkdtempSync(join(tmpdir(),'shiftoryx-trivy-gate-')),tree=join(directory,'tree');mkdirSync(tree);
 for(const [path,bytes] of files){const target=join(tree,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});}
 const required=['package-lock.json','package.json','functions/package-lock.json','security/npm-audit-exceptions.json','security/trivy-audit-exception.json'];
 if(required.some(f=>!files.has(f)))throw new GateError('TRIVY_MISSING_INPUT');
 const evidence:TrivyEvidence={rootLockText:files.get('package-lock.json')!.toString('utf8'),manifestText:files.get('package.json')!.toString('utf8'),functionsLockText:files.get('functions/package-lock.json')!.toString('utf8'),npmPolicyText:files.get('security/npm-audit-exceptions.json')!.toString('utf8'),context:captureReviewedContext(tree)};
 assertReviewedContext(tree,npmPolicy);
 const policy=readJson(join(tree,'security/trivy-audit-exception.json'));
 validateScanSeal(before,seal(inventory(ROOT)));
 const executable=binary(),executableHash=sha(readFileSync(executable));
 const options={cwd:directory,env:environment(),shell:false,encoding:'utf8' as const,windowsHide:true,timeout:360000,maxBuffer:4*1024*1024};
 const version=spawnSync(executable,['--version'],options);
 const versionLines=version.stdout.split(/\r?\n/).filter(l=>l.startsWith('Version:'));
 if(version.error||version.signal||version.status!==0||versionLines.length!==1||versionLines[0]!=='Version: '+VERSION)throw new GateError('TRIVY_SCANNER_VERSION');
 if(sha(readFileSync(executable))!==executableHash)throw new GateError('TRIVY_EXECUTABLE_DRIFT');
 const emptyIgnore=join(directory,'no-suppression.txt');
 writeFileSync(emptyIgnore,'',{flag:'wx'});
 const treeSeal=Object.fromEntries([...files.keys()].map(p=>[p,sha(readFileSync(join(tree,p)))]));
 validateScanSeal(before,treeSeal);
 const scan=(name:string,ignoreUnfixed:boolean)=>{
  const output=join(directory,name);if(existsSync(output))throw new GateError('TRIVY_STALE_OUTPUT');
  const startedAt=new Date().toISOString();
  const result=spawnSync(executable,['fs','--scanners','vuln,misconfig,secret','--pkg-types','os,library','--severity','HIGH,CRITICAL','--exit-code','1','--ignore-unfixed='+String(ignoreUnfixed),'--format','json','--output',output,'--cache-dir',join(tmpdir(),'shiftoryx-trivy-cache-0.70.0'),'--ignorefile',emptyIgnore,'--timeout','5m','--no-progress',tree],options);
  const finishedAt=new Date().toISOString();
  if(result.error||result.signal||result.status!==1||!existsSync(output)||!lstatSync(output).isFile()||lstatSync(output).isSymbolicLink()||statSync(output).size>4*1024*1024)throw new GateError('TRIVY_EXECUTION_FAILED');
  const receipt:ScanReceipt={version:VERSION,artifactName:tree.replace(/\\/g,'/'),scanners:['vuln','misconfig','secret'],severities:['HIGH','CRITICAL'],exitCode:1,ignoreUnfixed,startedAt,finishedAt,outputWrittenAt:statSync(output).mtime.toISOString()};
  return {process:{status:result.status,stdout:readFileSync(output,'utf8')},receipt};
 };
 // The exact scan command is authoritative coverage: empty findings are omitted
 // by native Trivy, so raw JSON alone cannot certify an enabled secret scanner.
 const first=scan('fresh-report.json',true);
 validateTrivyProcess(first.process,policy,evidence,first.receipt);
 const full=scan('all-status-report.json',false);
 const answer=validateTrivyPair(first.process,first.receipt,full.process,full.receipt,policy,evidence);
 const afterTree=Object.fromEntries([...files.keys()].map(p=>[p,sha(readFileSync(join(tree,p)))]));
 validateScanSeal(before,afterTree);validateScanSeal(before,seal(inventory(ROOT)));
 assertReviewedContext(ROOT,readJson(join(ROOT,'security/npm-audit-exceptions.json')));
 if(readFileSync(emptyIgnore).length!==0)throw new GateError('TRIVY_SUPPRESSION_DRIFT');
 if(sha(readFileSync(executable))!==executableHash)throw new GateError('TRIVY_EXECUTABLE_DRIFT');
 writeFileSync(join(directory,'execution-receipt.json'),JSON.stringify({primary:first.receipt,allStatuses:full.receipt},null,2),{flag:'wx'});
 return {...answer,directory};
}
