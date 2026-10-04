import {readFileSync,statSync,readdirSync,lstatSync,existsSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,relative,extname,isAbsolute,basename,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {GateError,parseStrictJson,validatePolicy,CONTEXT_PATHS} from './auditExceptionPolicy.ts';
export const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export {CONTEXT_PATHS};
function digest(buffer:Buffer):string {return createHash('sha256').update(buffer).digest('hex').toUpperCase();}
function contents(file:string):Buffer {
 const info=lstatSync(file);if(info.isSymbolicLink()||!info.isFile()||info.size>32*1024*1024)throw new GateError('CONTEXT_FILE');
 const bytes=readFileSync(file);
 return ['.js','.jsx','.mjs','.cjs','.ts','.tsx','.json','.css','.html','.md','.svg','.yml','.yaml','.rules',''].includes(extname(file))
 ?Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')):bytes;
}
export function captureReviewedContext(root:string):Record<string,string> {
 const hashes:Record<string,string>={};
 for(const name of CONTEXT_PATHS){
  const target=join(root,name);
  if(lstatSync(target).isDirectory()){
   const entries:string[]=[];
   const walk=(dir:string)=>{for(const item of readdirSync(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isSymbolicLink())throw new GateError('CONTEXT_LINK');if(item.isDirectory())walk(p);else if(item.isFile())entries.push(relative(target,p).replace(/\\/g,'/')+'\0'+digest(contents(p)));}};
   walk(target);hashes[name]=digest(Buffer.from(entries.sort().join('\n')));
  }else hashes[name]=digest(contents(target));
 }
 return hashes;
}
export function assertReviewedContext(root:string,policy:unknown):void {
 const p=validatePolicy(policy) as unknown as {reviewedContext:Record<string,string>};
 const actual=captureReviewedContext(root);
 for(const key of CONTEXT_PATHS)if(actual[key]!==p.reviewedContext[key])throw new GateError('REVIEWED_CONTEXT_DRIFT');
}
export function readJson(path:string):unknown {
 if(!statSync(path).isFile()||statSync(path).size>4*1024*1024)throw new GateError('INPUT_FILE');
 return parseStrictJson(readFileSync(path,'utf8'));
}
export function loadInputs(options:Record<string,string>={}) {
 const policy=readJson(options.policy||join(ROOT,'security/npm-audit-exceptions.json'));
 assertReviewedContext(ROOT,policy);
 return {policy,lock:readJson(options.lockfile||join(ROOT,'package-lock.json')),manifest:readJson(options.manifest||join(ROOT,'package.json'))};
}
export const EXPECTED_NPM_VERSION='10.9.4';
function npmCli():string {
 const base=dirname(process.execPath);
 const candidates=[join(base,'node_modules/npm/bin/npm-cli.js'),resolve(base,'../lib/node_modules/npm/bin/npm-cli.js')];
 const override=process.env.SHIFTORYX_AUDIT_NPM_CLI;
 const found=override===undefined?candidates.find(p=>existsSync(p)&&statSync(p).isFile()):override;
 if(!found||!isAbsolute(found)||!existsSync(found)||basename(found)!=='npm-cli.js'||basename(dirname(found))!=='bin')throw new GateError('NPM_RESOLUTION');
 if(lstatSync(found).isSymbolicLink()||realpathSync(found).toLowerCase()!==resolve(found).toLowerCase())throw new GateError('NPM_RESOLUTION');
 return realpathSync(found);
}
export function runNpm(args:string[],cwd=ROOT) {
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOME|HOMEDRIVE|HOMEPATH)$/i.test(k)));
 Object.assign(env,{CI:'true',FORCE_COLOR:'0'});
 const pathKey=Object.keys(env).find(k=>k.toUpperCase()==='PATH')||'PATH';
 env[pathKey]=dirname(process.execPath)+delimiter+(env[pathKey]||'');
 const cli=npmCli(),manifest=join(dirname(dirname(cli)),'package.json');
 let metadata:any;
 try{metadata=readJson(manifest);}catch{throw new GateError('NPM_METADATA');}
 if(metadata?.name!=='npm'||metadata?.version!==EXPECTED_NPM_VERSION||lstatSync(manifest).isSymbolicLink())throw new GateError('NPM_VERSION');
 const seal=()=>digest(readFileSync(cli))+'|'+digest(readFileSync(manifest));
 const initial=seal();
 const options={cwd,env,encoding:'utf8' as const,windowsHide:true,shell:false,timeout:180000,maxBuffer:4*1024*1024};
 const probe=spawnSync(process.execPath,[cli,'--version'],options);
 if(probe.error||probe.signal||probe.status!==0||probe.stdout.trim()!==EXPECTED_NPM_VERSION)throw new GateError('NPM_VERSION');
 if(seal()!==initial)throw new GateError('NPM_EXECUTABLE_DRIFT');
 const r=spawnSync(process.execPath,[cli,...args],options);
 if(seal()!==initial)throw new GateError('NPM_EXECUTABLE_DRIFT');
 return {status:r.status,stdout:r.stdout||'',error:r.error,signal:r.signal,npmVersion:EXPECTED_NPM_VERSION};
}
export function parseOptions(args:string[],allowed:string[]):Record<string,string> {
 const result:Record<string,string>={};
 for(let i=0;i<args.length;i++){
  const name=args[i].replace(/^--/,'');
  if(!args[i].startsWith('--')||!allowed.includes(name)||Object.hasOwn(result,name))throw new GateError('ARGUMENTS');
  if(name==='run'){result.run='true';continue;}
  const value=args[++i];if(!value||value.startsWith('--'))throw new GateError('ARGUMENTS');
  result[name]=value;
 }
 return result;
}
export function fail(error:unknown):void {console.error(error instanceof GateError?error.code:'GATE_EXECUTION_FAILED');process.exitCode=1;}
