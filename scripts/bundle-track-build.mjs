import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
const dir=new URL('./track-build/',import.meta.url);
const files=Object.fromEntries(readdirSync(dir).filter(n=>!n.startsWith('.')&&!n.startsWith('__')).sort().map(n=>[n,readFileSync(new URL(n,dir),'utf8')]));
const output=JSON.stringify(files,null,2)+'\n';
const dest=new URL('../src/assets/track-build.json',import.meta.url);
if(process.argv.includes('--check')) {
 if(readFileSync(dest,'utf8')!==output)throw Error('Track tools bundle is stale. Run node scripts/bundle-track-build.mjs');
} else writeFileSync(dest,output);
