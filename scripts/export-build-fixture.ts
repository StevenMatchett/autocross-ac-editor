// Reproducible Blender smoke fixtures: tsx scripts/export-build-fixture.ts <output> [--venue]
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {gunzipSync} from 'fflate';
import {buildExport} from '../src/export.ts';
import {demoLayout,emptyLayout} from '../src/model.ts';
import {RoadSurface} from '../src/road-surface.ts';
const output=resolve(process.argv[2]);
const venue=process.argv.includes('--venue');
const layout=venue?demoLayout('lincoln'):{...emptyLayout(),name:'Small compiler fixture',columns:6,rows:6,items:[
 {id:'c',kind:'cone' as const,x:8,z:8,angle:37},
 {id:'p',kind:'pointer' as const,x:12,z:12,angle:90},
 {id:'s',kind:'stage' as const,x:20,z:20,angle:37},
 {id:'t',kind:'start' as const,x:25,z:25,angle:90},
 {id:'f',kind:'finish' as const,x:35,z:35,angle:270},
]};
if(venue)layout.items.push({id:'finish-fixture',kind:'finish',x:490,z:480,angle:180});
const road=venue?new RoadSurface(gunzipSync(readFileSync(new URL('../public/venue/road.bin.gz',import.meta.url)))):undefined;
const glb=venue?gunzipSync(readFileSync(new URL('../public/venue/lincoln.glb.gz',import.meta.url))):undefined;
const bundle=buildExport(layout,glb,road);
for(const [name,bytes] of Object.entries(bundle.files)){
 const path=resolve(output,name);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);
}
console.log('Generated',bundle.slug,'at',output);
