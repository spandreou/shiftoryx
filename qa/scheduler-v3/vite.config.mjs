import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export default defineConfig({root,envDir:false,plugins:[{
  name:'qa-loopback-firebase',enforce:'pre',
  load(id){if(id.replaceAll('\\','/').endsWith('/src/firebase/config.js'))return readFileSync(new URL('./firebaseClient.js',import.meta.url),'utf8');},
},react()],server:{host:'127.0.0.1',port:5191,strictPort:true,hmr:false,allowedHosts:['shiftoryx.gr','qa-fuel.shiftoryx.gr','qa-cafe.shiftoryx.gr','qa-salon.shiftoryx.gr','qa-market.shiftoryx.gr']},
  define:{'import.meta.env.VITE_ENABLE_SCHEDULER_V3':'"true"','import.meta.env.VITE_ENABLE_AUTH_BROKER':'"true"','import.meta.env.VITE_ENABLE_TENANT_GATE':'"true"','import.meta.env.VITE_PUBLIC_APP_BASE_DOMAIN':'"shiftoryx.gr"','import.meta.env.VITE_CENTRAL_PORTAL_DOMAIN':'"shiftoryx.gr"'},
});
