import assert from 'node:assert/strict';
import {ResetError} from '../functions/src/public-demo/reset-state.ts';
const mod=await import('../functions/src/public-demo/reset-errors.ts').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
assert.equal(typeof mod.resetHttpFailure,'function','B3 safe reset error classifier missing');
const expected={RESET_ACCESS_DENIED:'permission-denied',RESET_NOT_INITIALIZED:'failed-precondition',RESET_ALREADY_EXISTS:'already-exists',
  RESET_IN_PROGRESS:'aborted',RESET_COOLDOWN:'resource-exhausted',RESET_GENERATION_CHANGED:'aborted',RESET_LEASE_LOST:'aborted',
  RESET_RECOVERY_REQUIRED:'failed-precondition',RESET_STATE_CORRUPT:'failed-precondition',RESET_INTENT_MISMATCH:'failed-precondition',
  RESET_INTENT_CAPACITY:'failed-precondition',RESET_PDF_RECOVERY_REQUIRED:'failed-precondition',RESET_PDF_BUSY:'unavailable',
  RESET_CAPACITY_EXCEEDED:'failed-precondition',RESET_FINALIZE_INVALID:'failed-precondition',RESET_TRANSIENT:'unavailable'};
for(const [code,http]of Object.entries(expected)){const result=mod.resetHttpFailure(new ResetError(code));assert.equal(result.code,http);assert.deepEqual(result.details,{code});}
for(const code of ['auth/id-token-revoked','auth/user-not-found','auth/user-disabled'])assert.equal(mod.resetHttpFailure({code}).code,'aborted');
for(const code of [4,8,10,14,408,429,500,502,503,504,'ECONNRESET','ETIMEDOUT','app/network-error','app/network-timeout',
  'auth/too-many-requests','auth/quota-exceeded'])assert.equal(mod.resetHttpFailure({code}).code,'unavailable');
const secret=new Error('fake-private-path-do-not-return');assert.equal(mod.resetHttpFailure(secret).code,'internal');
assert.ok(!JSON.stringify(mod.resetHttpFailure(secret)).includes(secret.message));
console.log('B3_RESET_ERROR_CLASSIFICATION_PASS codes=16 revokedTokensDenied transientControlled internalRedacted');
