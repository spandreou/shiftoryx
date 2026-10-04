import assert from 'node:assert/strict';

const module=await import('../functions/src/public-demo/mutation-http.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});
assert.equal(typeof module.parseMutationRequest,'function','typed mutation HTTP parser missing');
const request=(data,headers={})=>{const body=Buffer.from(JSON.stringify(data));return {method:'POST',query:{},body,headers:{
  'content-type':'application/json','content-length':String(body.length),...headers}};};
const command={operation:'emp.create',commandId:'emp_12345678-1234-4123-8123-123456789abc',payload:{fullName:'Demo'}};
assert.deepEqual(module.parseMutationRequest(request(command)),command);
assert.throws(()=>module.parseMutationRequest(request({...command,tenantId:'demo-cafe'})),{code:'INVALID_REQUEST'});
assert.throws(()=>module.parseMutationRequest(request(command,{'content-encoding':'gzip'})),{code:'UNSUPPORTED_MEDIA_TYPE'});
assert.throws(()=>module.parseMutationRequest({...request(command),method:'GET'}),{code:'METHOD_NOT_ALLOWED'});
assert.throws(()=>module.parseMutationRequest(request({...command,payload:{fullName:'x'.repeat(10*1024)}})),{code:'PAYLOAD_TOO_LARGE'});
assert.throws(()=>module.parseMutationRequest({...request(command),query:{tenantId:'demo-cafe'}}),{code:'INVALID_REQUEST'});
console.log('PUBLIC_DEMO_MUTATION_HTTP_PARSER_PASS');
