import {UUID_V4} from './pdf-authorization.ts';

export const QUALIFICATION_PREFIX_ROOT='qualification/gcs-immutability/';
export const QUALIFICATION_OBJECT_NAMES=['create-only.pdf','exact-generation.pdf','conditional-delete.pdf','adapter-mapping.pdf'] as const;
export type QualificationObjectName=typeof QUALIFICATION_OBJECT_NAMES[number];
export class QualificationPathError extends Error {constructor(){super('QUALIFICATION_PATH_DENIED');this.code='QUALIFICATION_PATH_DENIED';}readonly code:string;}
export function qualificationObjectPath(runId:unknown,name:unknown){
  if(typeof runId!=='string'||!UUID_V4.test(runId)||runId!==runId.toLowerCase()||typeof name!=='string'||!(QUALIFICATION_OBJECT_NAMES as readonly string[]).includes(name))throw new QualificationPathError();
  return `${QUALIFICATION_PREFIX_ROOT}${runId}/${name}`;
}
