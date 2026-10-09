import {onCall,HttpsError,type CallableRequest} from 'firebase-functions/v2/https';
import {createAuthTicket as originalCreate,exchangeAuthTicket as originalExchange} from '../index.js';
import {fenceDemoBroker} from './broker-fence.ts';
import {DEMO_LANDING_ORIGIN,DEMO_TENANTS,demoOrigin,isDemoTenant} from './policy.ts';

function assertCreateRequest(request:CallableRequest<any>){
  if(request.rawRequest?.headers?.origin!==DEMO_LANDING_ORIGIN||!isDemoTenant(request.data?.tenantId))
    throw new HttpsError('permission-denied','Δεν ήταν δυνατή η επιβεβαίωση πρόσβασης.');
}
function assertExchangeRequest(request:CallableRequest<any>){
  if(!DEMO_TENANTS.some(tenant=>demoOrigin(tenant)===request.rawRequest?.headers?.origin))
    throw new HttpsError('permission-denied','Δεν ήταν δυνατή η επιβεβαίωση πρόσβασης.');
}

// Dedicated outer callable middleware validates/decode Auth and preserves the
// CallableRequest. The shared business callbacks still perform their original
// tenant/origin/membership/admin checks. Never export their unfenced functions.
export const createAuthTicket=onCall({cors:[DEMO_LANDING_ORIGIN],region:'us-central1',maxInstances:2},
  fenceDemoBroker((request:CallableRequest<any>)=>{assertCreateRequest(request);return originalCreate.run(request);}));
export const exchangeAuthTicket=onCall({cors:DEMO_TENANTS.map(demoOrigin),region:'us-central1',maxInstances:2},
  fenceDemoBroker((request:CallableRequest<any>)=>{assertExchangeRequest(request);return originalExchange.run(request);}));
