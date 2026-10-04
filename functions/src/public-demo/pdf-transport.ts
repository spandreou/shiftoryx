// Internal core only: intentionally no onRequest/onCall and no deployment-entry export.
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {canonicalJson} from '../../../src/services/publicationIntentV3.ts';
import type {SchedulePublicationV3} from '../../../src/scheduler-engine-v3/types.ts';
import {isDemoTenant} from './policy.ts';
import {fail,UUID_V4} from './pdf-authorization.ts';
export function newPublicationId():string { return randomUUID(); }
export function publicationObjectPath(tenant:unknown,publicationId:unknown):string {
  if(!isDemoTenant(tenant))fail('ACCESS_DENIED');
  if(typeof publicationId!=='string'||!UUID_V4.test(publicationId))fail('INVALID_REQUEST');
  return `tenants/${tenant}/schedule-publications/${publicationId}/schedule.pdf`;
}
export type PdfMetadata={sha256:string;byteLength:number;contentType:'application/pdf'};
export function validatePdfBytes(bytes:unknown):PdfMetadata {
  if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>=2*1024*1024)fail('PDF_INTEGRITY_FAILURE');
  const buffer=Buffer.from(bytes);
  if(buffer.subarray(0,5).toString('ascii')!=='%PDF-'||!/[\r\n]%%EOF[\x20\t\r\n]*$/.test(buffer.subarray(-64).toString('ascii')))fail('PDF_INTEGRITY_FAILURE');
  return {sha256:createHash('sha256').update(buffer).digest('hex'),byteLength:bytes.length,contentType:'application/pdf'};
}
const rendererFile=new URL('./pdf-renderer.cjs',import.meta.url);
export function rendererDigest():string {return createHash('sha256').update(readFileSync(rendererFile)).digest('hex');}
export async function renderServerPublication(snapshot:SchedulePublicationV3):Promise<Uint8Array>{
  const {renderPublicationPdfV3}=createRequire(import.meta.url)('./pdf-renderer.cjs');
  const fileId=createHash('sha256').update(canonicalJson(snapshot)).digest('hex').slice(0,32);
  const bytes=await renderPublicationPdfV3(snapshot,{creationDate:snapshot.pdfGeneratedAt,fileId});
  validatePdfBytes(bytes);return bytes;
}
