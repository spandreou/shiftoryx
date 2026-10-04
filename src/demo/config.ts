import {DEMO_PROJECT_ID,DEMO_EMULATOR_PROJECT_ID,DEMO_TENANTS,DEMO_LANDING_ORIGIN,isDemoTenant} from '../../functions/src/public-demo/policy.ts';
export {DEMO_TENANTS,DEMO_LANDING_ORIGIN,isDemoTenant};
export const publicDemoEnabled=import.meta.env.VITE_PUBLIC_DEMO_ENABLED==='true';
export function assertPublicDemoEnvironment(){
  const project=import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if(!publicDemoEnabled||(project!==DEMO_PROJECT_ID&&!(import.meta.env.DEV&&project===DEMO_EMULATOR_PROJECT_ID)))throw new Error('Μη έγκυρο περιβάλλον demo.');
}
