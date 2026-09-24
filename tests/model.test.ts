import {natsCone} from '../src/nats-assets.ts';
import {completeLayout} from './fixtures.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {PAD,CONE_HEIGHT,CONE_BASE,FOOT,emptyLayout,demoLayout,validateLayout,snap} from '../src/model.ts';
import {buildExport} from '../src/export.ts';
test('real-world geometry uses exact feet and inches',()=>{assert.equal(PAD,7.62);assert.ok(Math.abs(CONE_HEIGHT-.4572)<1e-10);assert.equal(snap(8.1,5*FOOT),7.62);});
test('layouts round trip without moving objects',()=>{const l=demoLayout();assert.deepEqual(validateLayout(JSON.parse(JSON.stringify(l))),l);});
test('invalid layouts and duplicate gates are rejected',()=>{const l=demoLayout();l.items.push({...l.items.find(i=>i.kind==='start')!,id:'duplicate'});assert.throws(()=>validateLayout(l));const b=demoLayout();b.items[0].x=-1;assert.throws(()=>validateLayout(b));assert.throws(()=>validateLayout({...emptyLayout(),rows:2.5}));});
test('export requires timing gates',()=>{assert.throws(()=>buildExport(emptyLayout()),/staging, start, and finish/);});
test('export contains recoverable layout, physical surface config and correctly scaled generator',()=>{const l=completeLayout();const result=buildExport(l);const files=unzipSync(result.zip);assert.deepEqual(JSON.parse(strFromU8(files['layout.json'])),l);const script=strFromU8(files['build_track.py']);assert.match(script,/HEIGHT = 0.457/);assert.match(script,/AC_AB_START/);assert.match(script,/AC_AB_FINISH/);assert.match(script,/AC_PIT_0/);assert.match(strFromU8(files[`${result.slug}/models.ini`]),new RegExp(result.slug+'.kn5'));assert.match(strFromU8(files[`${result.slug}/data/surfaces.ini`]),/KEY=ROAD/);});

test('pointer cones preserve headings and allow multiple placements',()=>{
 const l=emptyLayout();l.items=[{id:'p1',kind:'pointer',x:10,z:10,angle:90},{id:'p2',kind:'pointer',x:12,z:10,angle:270}];
 assert.deepEqual(validateLayout(JSON.parse(JSON.stringify(l))).items,l.items);
 const exported=buildExport({...l,items:[...l.items,{id:'s',kind:'start',x:20,z:20,angle:0},{id:'f',kind:'finish',x:30,z:30,angle:180},{id:'stage',kind:'stage',x:20,z:25,angle:0}]});
 const script=strFromU8(exported.files['build_track.py']);
 assert.match(script,/asset=cone_assets\[item\['kind'\]\]/);
 assert.match(script,/obj.rotation_euler.z=-math.radians\(a\)/);
 const roundTrip=JSON.parse(strFromU8(unzipSync(exported.zip)['layout.json']));
 assert.equal(roundTrip.items[0].angle,90);assert.equal(roundTrip.items[1].angle,270);
});

test('original cone templates are grounded, correctly scaled, and have valid geometry',()=>{
 for(const kind of ['cone','pointer'] as const){
  const asset=natsCone[kind],p=asset.positions;
  const ys=p.filter((_,i)=>i%3===1);
  assert.ok(Math.abs(Math.min(...ys))<1e-7);
  assert.equal(p.length/3,36);assert.equal(asset.indices.length/3,44);
  assert.ok(asset.indices.every(i=>i>=0&&i<p.length/3));
  assert.equal(asset.normals.length,p.length);assert.equal(asset.uv.length,p.length/3*2);
 }
 assert.ok(Math.abs(natsCone.cone.bounds[1][1]-CONE_HEIGHT)<1e-7);
 assert.ok(CONE_BASE>.29&&CONE_BASE<.30);
 assert.ok(natsCone.pointer.bounds[2][0]<-.44);
});

test('staging is unique and required for export; existing layouts still open',()=>{
 const l=completeLayout();const stage=l.items.find(i=>i.kind==='stage')!;
 l.items.push({...stage,id:'duplicate-stage'});assert.throws(()=>validateLayout(l));
 l.items=l.items.filter(i=>i.kind!=='stage');assert.doesNotThrow(()=>validateLayout(l));assert.throws(()=>buildExport(l),/staging/);
});
test('export spawns at staging and keeps timing markers separate',()=>{
 const script=strFromU8(buildExport(completeLayout()).files['build_track.py']);
 assert.match(script,/elif item\['kind'\]=='stage':\n        marker\('AC_PIT_0',x,z,a\)\n        marker\('AC_HOTLAP_START_0',x,z,a\)/);
 assert.doesNotMatch(script,/x-5\*math.sin/);
});

test('both cone orientations export as fixed collision meshes',()=>{
 const bundle=buildExport(completeLayout());const script=strFromU8(bundle.files['build_track.py']);
 // The shared cone branch must create static WALL geometry before pointer rotation.
 const begin=script.indexOf("if item['kind'] in ('cone', 'pointer'):");
 const end=script.indexOf("elif item['kind']=='stage':",begin);
 const cones=script.slice(begin,end);
 assert.match(cones,/bpy.data.objects.new\('1WALL_'\+item\['kind'\]\+'_%04d'%index,mesh\)/);
 assert.match(cones,/mesh.from_pydata/);
 assert.doesNotMatch(script,/bpy\.ops\.rigidbody/);
 assert.match(strFromU8(bundle.files['README.txt']),/Keep 1WALL_cone_\* and 1WALL_pointer_\* mesh names intact/);
});
