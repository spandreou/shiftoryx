import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const output=join(mkdtempSync(join(tmpdir(),'shiftoryx-v3-test-')),'emulator.cjs');
await build({entryPoints:[fileURLToPath(new URL('./test-scheduler-v3-emulator.mjs',import.meta.url))],outfile:output,bundle:true,platform:'node',format:'cjs',define:{'import.meta':'{}','import.meta.env':JSON.stringify({VITE_ENABLE_SCHEDULER_V3:'true',VITE_FIREBASE_API_KEY:'demo-key',VITE_FIREBASE_AUTH_DOMAIN:'demo-shiftoryx-v3.firebaseapp.com',VITE_FIREBASE_PROJECT_ID:'demo-shiftoryx-v3',VITE_FIREBASE_STORAGE_BUCKET:'demo-shiftoryx-v3.appspot.com',VITE_FIREBASE_MESSAGING_SENDER_ID:'123',VITE_FIREBASE_APP_ID:'demo-app',DEV:false})}});
const result=spawnSync(process.execPath,[output],{stdio:'inherit',env:process.env});process.exitCode=result.status??1;
