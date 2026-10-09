import {fileURLToPath} from 'node:url';
import {buildMaintenance} from './lib/demoMaintenance.ts';

const defaultSource=fileURLToPath(new URL('../maintenance/public-demo/',import.meta.url));
let source=defaultSource,parent;
for(let i=2;i<process.argv.length;i+=2){
  const flag=process.argv[i],value=process.argv[i+1];
  if(!value||!['--source','--parent'].includes(flag))throw new Error('MAINTENANCE_ARGUMENT_REJECTED');
  if(flag==='--source')source=value;else parent=value;
}
process.stdout.write(JSON.stringify(buildMaintenance(source,parent))+'\n');
