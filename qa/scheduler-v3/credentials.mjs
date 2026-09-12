import {chmodSync,lstatSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {basename,resolve,relative,isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export function secureCredentialFile(file){
  const target=resolve(file),root=fileURLToPath(new URL('../../',import.meta.url)),rel=relative(root,target);
  if(basename(target)!=='credentials.json'||(!rel.startsWith('..')&&!isAbsolute(rel))||!lstatSync(target).isFile()||lstatSync(target).isSymbolicLink())throw new Error('Credential protection requires an external regular credentials.json file.');
  if(process.platform!=='win32'){chmodSync(target,0o600);return;}
  const script="$ErrorActionPreference='Stop'; $acl=New-Object System.Security.AccessControl.FileSecurity; $acl.SetAccessRuleProtection($true,$false); $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl.SetOwner($sid); $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow'); $acl.AddAccessRule($rule); [System.IO.File]::SetAccessControl($env:SHIFTORYX_QA_CREDENTIAL_FILE,$acl)";
  const result=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,SHIFTORYX_QA_CREDENTIAL_FILE:target},windowsHide:true,encoding:'utf8'});
  if(result.status!==0)throw new Error('Unable to restrict the QA credential file: '+(result.error?.code||result.stderr?.trim()||'ACL command failed.'));
}
