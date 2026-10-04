import {HttpsError} from 'firebase-functions/v2/https';
import {ResetError,type ResetErrorCode} from './reset-state.ts';
const codes:Record<ResetErrorCode,ConstructorParameters<typeof HttpsError>[0]>={
  RESET_ACCESS_DENIED:'permission-denied',RESET_NOT_INITIALIZED:'failed-precondition',RESET_ALREADY_EXISTS:'already-exists',
  RESET_IN_PROGRESS:'aborted',RESET_COOLDOWN:'resource-exhausted',RESET_GENERATION_CHANGED:'aborted',RESET_LEASE_LOST:'aborted',
  RESET_RECOVERY_REQUIRED:'failed-precondition',RESET_STATE_CORRUPT:'failed-precondition',RESET_INTENT_MISMATCH:'failed-precondition',
  RESET_INTENT_CAPACITY:'failed-precondition',RESET_PDF_RECOVERY_REQUIRED:'failed-precondition',RESET_PDF_BUSY:'unavailable',
  RESET_CAPACITY_EXCEEDED:'failed-precondition',RESET_FINALIZE_INVALID:'failed-precondition',RESET_TRANSIENT:'unavailable',
};
/** Never serialize provider messages, paths, tokens or stacks. Revocation stays enforced. */
export function resetHttpFailure(error:unknown):HttpsError{
  if(error instanceof HttpsError)return error;
  if(error instanceof ResetError)return new HttpsError(codes[error.code],
    error.code==='RESET_COOLDOWN'?'Το demo επαναφέρθηκε πρόσφατα. Δοκίμασε σε λίγα λεπτά.':
      error.code==='RESET_IN_PROGRESS'?'Γίνεται ήδη επαναφορά του demo.':
        'Η επαναφορά δεν μπορεί να ολοκληρωθεί αυτή τη στιγμή.',{code:error.code});
  const provider=(error as {code?:unknown}|null)?.code;
  if(['auth/id-token-revoked','auth/user-not-found','auth/user-disabled'].includes(String(provider)))
    return resetHttpFailure(new ResetError('RESET_GENERATION_CHANGED'));
  if(['auth/argument-error','auth/invalid-id-token','auth/id-token-expired'].includes(String(provider)))
    return new HttpsError('unauthenticated','Απαιτείται νέα είσοδος στο demo.');
  if([4,8,10,14,408,429,500,502,503,504,'ECONNRESET','ETIMEDOUT','EAI_AGAIN','app/network-error','app/network-timeout',
    'auth/internal-error','auth/too-many-requests','auth/quota-exceeded'].includes(provider as any))
    return resetHttpFailure(new ResetError('RESET_TRANSIENT'));
  if(error instanceof Error&&error.message.startsWith('DEMO_'))return resetHttpFailure(new ResetError('RESET_ACCESS_DENIED'));
  return new HttpsError('internal','Το demo δεν είναι διαθέσιμο αυτή τη στιγμή. Δοκίμασε ξανά.');
}
