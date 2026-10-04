import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const MARKER='@@DEMO_VALIDATORS@@';
const ACCEPTED_SHA256='33941db2170c3be408d586955aa985b65d54b383e64d9812adb440fd5a101b49';

function readExplicitSource(sourceRoot,name){
  if(typeof sourceRoot!=='string'||!sourceRoot)throw new Error('DEMO_RULES_SOURCE_INVALID');
  const path=join(resolve(sourceRoot),'rules','demo',name);
  try{
    const stat=lstatSync(path);
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('DEMO_RULES_SOURCE_INVALID');
    return readFileSync(path,'utf8').replaceAll('\r\n','\n');
  }catch(error){
    if(error?.message==='DEMO_RULES_SOURCE_INVALID')throw error;
    throw new Error('DEMO_RULES_SOURCE_MISSING');
  }
}

export function renderDemoFirestoreRules(sourceRoot){
  const template=readExplicitSource(sourceRoot,'firestore.template.rules');
  const validators=readExplicitSource(sourceRoot,'firestore.validators.rules');
  if(template.split(MARKER).length!==2||!template.startsWith('// Demo-only generated Rules.')||
      !validators.startsWith('    function isIsoDate(value) {')||
      /^\s*(?:allow|match|service)\b/m.test(validators)||
      /demoAccess|demo-fuel|demo-cafe|demo-salon|demo-market/.test(validators))throw new Error('DEMO_RULES_SOURCE_INVALID');
  const rules=template.replace(MARKER,()=>validators);
  if(createHash('sha256').update(rules).digest('hex')!==ACCEPTED_SHA256)throw new Error('DEMO_RULES_SOURCE_INVALID');
  return rules;
}

export function generateDemoFirestoreRules(sourceRoot){
  const rules=renderDemoFirestoreRules(sourceRoot);
  writeFileSync(join(resolve(sourceRoot),'firestore.demo.rules'),rules);
}
