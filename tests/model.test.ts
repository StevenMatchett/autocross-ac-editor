import {completeLayout} from './fixtures.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {PAD,CONE_HEIGHT,CONE_BASE,POINTER_TILT,POINTER_CENTER_HEIGHT,FOOT,emptyLayout,demoLayout,validateLayout,snap} from '../src/model.ts';
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
 assert.match(script,/if item\['kind'\]=='pointer':/);
 assert.match(script,/rotation_euler.x=-math.pi\/2-/);
 const roundTrip=JSON.parse(strFromU8(unzipSync(exported.zip)['layout.json']));
 assert.equal(roundTrip.items[0].angle,90);assert.equal(roundTrip.items[1].angle,270);
});

test('sideways cones rest on the base edge and tip without sinking',()=>{
 const baseBottom=POINTER_CENTER_HEIGHT-CONE_BASE/2*Math.cos(POINTER_TILT)-.02*Math.sin(POINTER_TILT);
 const tipBottom=POINTER_CENTER_HEIGHT-(CONE_HEIGHT-.02)*Math.sin(POINTER_TILT)-.018*Math.cos(POINTER_TILT);
 assert.ok(Math.abs(baseBottom)<1e-10);assert.ok(Math.abs(tipBottom)<1e-10);
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
 assert.match(cones,/parts\[0\]\.name='1WALL_'\+item\['kind'\]\+'_%04d'%index/);
 assert.ok(cones.indexOf("name='1WALL_'")<cones.indexOf("if item['kind']=='pointer':"));
 assert.match(cones,/bpy\.ops\.object\.join\(\)/);
 assert.doesNotMatch(script,/bpy\.ops\.rigidbody/);
 assert.match(strFromU8(bundle.files['README.txt']),/Keep 1WALL_cone_\* and 1WALL_pointer_\* mesh names intact/);
});
