/**
 * Low-level Cloud Storage generation primitives.
 *
 * This module deliberately does not authorize paths, tenants, callers, or
 * buckets. Callers must establish those boundaries before invoking it.
 */
type GcsErrorLike={code?:unknown};
type FileLike={
  save(bytes:Buffer,options:Record<string,unknown>):Promise<void>;
  getMetadata():Promise<Array<Record<string,unknown>>>;
  createReadStream(options:Record<string,unknown>):AsyncIterable<Uint8Array>;
  delete(options:Record<string,unknown>):Promise<void>;
};
export type ImmutableGcsBucket={storage?:{retryOptions?:{autoRetry?:boolean;maxRetries?:number}};file(path:string,options?:{generation:string}):FileLike};
export type ImmutableGcsCode='CONFLICT'|'NOT_FOUND'|'REJECTED'|'GENERATION_MISMATCH'|'INVALID_GENERATION'|'LIVE_OBJECT_REMAINS';
export class ImmutableGcsError extends Error {
  readonly code:ImmutableGcsCode;
  constructor(code:ImmutableGcsCode){super(code);this.code=code;}
}

const generation=(value:unknown)=>typeof value==='string'&&/^\d+$/.test(value);
function mapError(error:unknown):never{
  const status=Number((error as GcsErrorLike)?.code);
  if(status===412)throw new ImmutableGcsError('CONFLICT');
  if(status===404)throw new ImmutableGcsError('NOT_FOUND');
  if([400,401,403].includes(status))throw new ImmutableGcsError('REJECTED');
  throw error;
}
export function disableImmutableGcsRetries(bucket:ImmutableGcsBucket){
  if(!bucket.storage?.retryOptions)throw new ImmutableGcsError('REJECTED');
  bucket.storage.retryOptions.autoRetry=false;bucket.storage.retryOptions.maxRetries=0;
}
export async function createImmutableObject(bucket:ImmutableGcsBucket,path:string,bytes:Uint8Array,options:{contentType:string}){
  const file=bucket.file(path);
  try{await file.save(Buffer.from(bytes),{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:options.contentType,cacheControl:'private, no-store, max-age=0'}});}catch(error){mapError(error);}
  let metadata:Record<string,unknown>;
  try{[metadata]=await file.getMetadata();}catch(error){mapError(error);}
  if(metadata.name!==path||!generation(String(metadata.generation)))throw new ImmutableGcsError('GENERATION_MISMATCH');
  return {generation:String(metadata.generation)};
}
export async function readExactGeneration(bucket:ImmutableGcsBucket,path:string,requestedGeneration:string,maxBytes:number){
  if(!generation(requestedGeneration)||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new ImmutableGcsError('INVALID_GENERATION');
  const file=bucket.file(path,{generation:requestedGeneration});let metadata:Record<string,unknown>;
  try{[metadata]=await file.getMetadata();}catch(error){mapError(error);}
  if(metadata.name!==path||String(metadata.generation)!==requestedGeneration)throw new ImmutableGcsError('GENERATION_MISMATCH');
  const expectedLength=Number(metadata.size);if(!Number.isSafeInteger(expectedLength)||expectedLength<0||expectedLength>maxBytes)throw new ImmutableGcsError('GENERATION_MISMATCH');
  const chunks:Buffer[]=[];let length=0;
  try{for await(const chunk of file.createReadStream({start:0,end:maxBytes,validation:false})){length+=chunk.length;if(length>maxBytes)throw new ImmutableGcsError('REJECTED');chunks.push(Buffer.from(chunk));}}catch(error){if(error instanceof ImmutableGcsError)throw error;mapError(error);}
  if(length!==expectedLength)throw new ImmutableGcsError('GENERATION_MISMATCH');
  return {bytes:Buffer.concat(chunks),generation:requestedGeneration,contentType:String(metadata.contentType||'')};
}
export async function deleteExactGeneration(bucket:ImmutableGcsBucket,path:string,requestedGeneration:string){
  if(!generation(requestedGeneration))throw new ImmutableGcsError('INVALID_GENERATION');
  try{await bucket.file(path,{generation:requestedGeneration}).delete({ifGenerationMatch:requestedGeneration});}catch(error){mapError(error);}
}
/** Current-live-object verification for cleanup only; never an exact-read fallback. */
export async function assertNoLiveObject(bucket:ImmutableGcsBucket,path:string){
  try{const [metadata]=await bucket.file(path).getMetadata();if(metadata.name===path)throw new ImmutableGcsError('LIVE_OBJECT_REMAINS');throw new ImmutableGcsError('GENERATION_MISMATCH');}
  catch(error){if(error instanceof ImmutableGcsError)throw error;if(Number((error as GcsErrorLike)?.code)===404)return;mapError(error);}
}
