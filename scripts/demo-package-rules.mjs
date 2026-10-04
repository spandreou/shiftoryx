import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {renderDemoFirestoreRules} from './demo-firestore-rules.mjs';

const STORAGE_SHA256='bd95635bc59dc8a67f2da75b6fafb4449cf7289f82189ed185f07d18ee562c40';
function readFile(path){
  try{const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error();return readFileSync(path);}
  catch{throw new Error('DEMO_PACKAGE_RULES_SOURCE_INVALID');}
}

export function copyDemoRuleFiles(sourceRoot,backendDir){
  if(typeof sourceRoot!=='string'||!sourceRoot||typeof backendDir!=='string'||!backendDir)throw new Error('DEMO_PACKAGE_RULES_SOURCE_INVALID');
  const root=resolve(sourceRoot),backend=resolve(backendDir);
  const firestorePath=join(root,'firestore.demo.rules'),storagePath=join(root,'storage.demo.rules');
  const expected=renderDemoFirestoreRules(root);
  if(!readFile(firestorePath).equals(Buffer.from(expected))||
      createHash('sha256').update(readFile(storagePath)).digest('hex')!==STORAGE_SHA256)throw new Error('DEMO_PACKAGE_RULES_SOURCE_INVALID');
  copyFileSync(firestorePath,join(backend,'firestore.rules'));
  copyFileSync(storagePath,join(backend,'storage.rules'));
}
