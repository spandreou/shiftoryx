import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realisticTenants,QA_PROJECT,QA_SUITE} from './fixtures.ts';
import {assertQaEnvironment} from './environment.mjs';
import {secureCredentialFile} from './credentials.mjs';

export async function seedQa(outputDirectory){
  assertQaEnvironment();
  const repository=fileURLToPath(new URL('../../',import.meta.url));
  const output=resolve(outputDirectory||'');const rel=relative(repository,output);
  if(!outputDirectory||(!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('Credentials must be stored outside the repository.');
  const require=createRequire(new URL('../../functions/package.json',import.meta.url));
  const {initializeApp,deleteApp}=require('firebase-admin/app');const {getAuth}=require('firebase-admin/auth');const {getFirestore}=require('firebase-admin/firestore');
  const app=initializeApp({projectId:QA_PROJECT},'qa-seed');const db=getFirestore(app),auth=getAuth(app);
  const credentials=[];
  try{
    // Refuse collisions before creating any user or document; do not reset existing tenants.
    for(const t of realisticTenants())if((await db.doc(`tenants/${t.slug}`).get()).exists)throw new Error('QA seed collision; restart a fresh demo emulator or reuse the existing credential file.');
    await mkdir(output,{recursive:true});
    for(const t of realisticTenants()){
      const email=`owner+${t.slug}@example.test`,password=process.env['QA_PASSWORD_'+t.slug.slice(3).toUpperCase()]||randomBytes(24).toString('base64url');
      if(password.length<16)throw new Error('QA supplied passwords must have at least 16 characters.');
      const uid='owner-'+t.slug;
      await auth.createUser({uid,email,password,emailVerified:true,displayName:`QA OWNER — ${t.name}`});
      const batch=db.batch();
      batch.create(db.doc(`tenants/${t.slug}`),{id:t.slug,slug:t.slug,displayName:t.name,businessCategory:t.category,domain:t.domain,status:'ACTIVE',qaSuite:QA_SUITE,isQa:true,createdAt:new Date()});
      batch.create(db.doc(`tenantMemberships/${uid}_${t.slug}`),{uid,tenantId:t.slug,role:'OWNER',status:'ACTIVE',createdAt:new Date(),qaSuite:QA_SUITE});
      batch.create(db.doc(`slugReservations/${t.slug}`),{tenantId:t.slug,slug:t.slug,status:'ACTIVE',qaSuite:QA_SUITE});
      batch.create(db.doc(`tenants/${t.slug}/settings/scheduler`),{schedulerSchemaVersion:3,schedulerConfigV3:t.config});
      for(const e of t.employees){const {id,...data}=e;batch.create(db.doc(`tenants/${t.slug}/employees/${id}`),{...data,createdAt:new Date(),updatedAt:new Date()});}
      for(const a of t.absences)batch.create(db.doc(`tenants/${t.slug}/absences/${a.id}`),{...a,createdAt:new Date(),updatedAt:new Date()});
      await batch.commit();credentials.push({tenant:t.slug,email,password,domain:t.domain,environment:'LOCAL_EMULATOR_ONLY'});
    }
    await writeFile(resolve(output,'credentials.json'),JSON.stringify(credentials,null,2),{mode:0o600,flag:'wx'});
    secureCredentialFile(resolve(output,'credentials.json'));
    console.log('QA seeded: four OWNER accounts; credential file created outside Git.');
    return credentials;
  }finally{await deleteApp(app);}
}
