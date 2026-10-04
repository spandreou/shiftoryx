export const DEMO_PROJECT_ID = 'shiftoryx-public-demo';
export const DEMO_EMULATOR_PROJECT_ID = 'demo-shiftoryx-public';
export const DEMO_LANDING_ORIGIN = 'https://demo.shiftoryx.gr';
export const DEMO_TENANTS = ['demo-fuel','demo-cafe','demo-salon','demo-market'] as const;
export type DemoTenant = typeof DEMO_TENANTS[number];
export function isDemoTenant(value:unknown):value is DemoTenant {return typeof value==='string'&&(DEMO_TENANTS as readonly string[]).includes(value);}
export function requireDemoTenant(value:unknown):DemoTenant {if(!isDemoTenant(value))throw new Error('DEMO_TENANT_DENIED');return value;}
export function demoOrigin(tenant:DemoTenant){return `https://${requireDemoTenant(tenant)}.shiftoryx.gr`;}
export function assertDemoRuntime(env:Record<string,string|undefined>){
  const project=env.GCLOUD_PROJECT||env.GOOGLE_CLOUD_PROJECT;
  const emulator=env.FUNCTIONS_EMULATOR==='true'&&project===DEMO_EMULATOR_PROJECT_ID;
  if(env.PUBLIC_DEMO_ENABLED!=='true'||env.PUBLIC_DEMO_PROJECT_ID!==DEMO_PROJECT_ID||(!emulator&&project!==DEMO_PROJECT_ID))throw new Error('DEMO_ENVIRONMENT_DENIED');
}
export function resolveDemoResetStorageTarget(env:Record<string,string|undefined>){
  assertDemoRuntime(env);
  const emulator=env.FUNCTIONS_EMULATOR==='true';
  const projectId=emulator?DEMO_EMULATOR_PROJECT_ID:DEMO_PROJECT_ID;
  if(![undefined,'false','true'].includes(env.FUNCTIONS_EMULATOR)||
      (emulator&&env.GCLOUD_PROJECT!==projectId&&env.GOOGLE_CLOUD_PROJECT!==projectId))throw new Error('DEMO_STORAGE_ENVIRONMENT_DENIED');
  for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT']){
    if(Object.hasOwn(env,key)&&env[key]!==projectId)throw new Error('DEMO_STORAGE_PROJECT_DENIED');
  }
  const emulatorHosts=['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'];
  if(emulator){
    if(emulatorHosts.some(key=>!/^127\.0\.0\.1:\d{2,5}$/.test(env[key]||''))||
        !/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(env.STORAGE_EMULATOR_HOST||''))throw new Error('DEMO_STORAGE_EMULATOR_DENIED');
  }else if([...emulatorHosts,'STORAGE_EMULATOR_HOST'].some(key=>Object.hasOwn(env,key)))throw new Error('DEMO_STORAGE_EMULATOR_DENIED');
  return {projectId,bucket:projectId+(emulator?'.appspot.com':'.firebasestorage.app')};
}
export function assertEntryOrigin(tenant:DemoTenant,origin:unknown){if(origin!==DEMO_LANDING_ORIGIN&&origin!==demoOrigin(tenant))throw new Error('DEMO_ORIGIN_DENIED');}
export function demoOwnerUid(tenant:DemoTenant,generation:number){if(!Number.isSafeInteger(generation)||generation<1)throw new Error('DEMO_GENERATION_DENIED');return `${requireDemoTenant(tenant)}-owner-g${generation}`;}
export function assertDemoIdentity(tenant:DemoTenant,state:{generation:number;resetting?:boolean},uid:unknown,claims:Record<string,unknown>){
  if(state.resetting||uid!==demoOwnerUid(tenant,state.generation)||claims.publicDemo!==true||claims.demoTenant!==tenant||claims.demoGeneration!==state.generation)throw new Error('DEMO_IDENTITY_DENIED');
}
