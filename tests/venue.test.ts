import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,strFromU8} from 'fflate';
import {RoadSurface} from '../src/road-surface.ts';
import {venueLayout,VENUE} from '../src/venue.ts';
import {validateLayout,demoLayout,FOOT,PAD,EXAMPLE_VENUE_OFFSET,onVenue} from '../src/model.ts';
import {DrivingSimulation,released} from '../src/driving.ts';
import {buildExport} from '../src/export.ts';
const road=new RoadSurface(gunzipSync(readFileSync(new URL('../public/venue/road.bin.gz',import.meta.url))));
test('venue layout round trips and keeps the fixed source coordinate transform',()=>{
 const layout=venueLayout();assert.deepEqual(validateLayout(layout),layout);
 assert.deepEqual(VENUE.offset,[22.86,0,518.16]);assert.equal(VENUE.files.length,9);
 assert.throws(()=>validateLayout({...layout,venue:'other'}));assert.throws(()=>validateLayout({...layout,columns:20}));
});
test('road height interpolates exact source triangle vertices and rejects points outside the source surface',()=>{
 const p=road.positions;let checked=0;
 for(let i=0;i<p.length;i+=300){const height=road.height(p[i],p[i+2]);assert.notEqual(height,null);assert.ok(Math.abs(height!-p[i+1])<.005);checked++;}
 assert.ok(checked>100);assert.equal(road.height(-100,-100),null);
 assert.equal(road.height(0,50),null);assert.notEqual(road.height(480,480),null);
 assert.ok(Math.abs(road.height(480,480)!-road.height(480,150)!)>.1);
});
test('driving on venue requires loaded terrain and stops at pavement edge',()=>{
 const layout=venueLayout();assert.throws(()=>new DrivingSimulation(layout),/surface/);
 const sim=new DrivingSimulation(layout,undefined,road);
 for(let i=0;i<120;i++)sim.step({...released(),forward:true},1/120);
 assert.ok(sim.pose.z<480);assert.ok(sim.speed>0);
 layout.items[0]={...layout.items[0],x:0,z:50};assert.throws(()=>new DrivingSimulation(layout,undefined,road),/surface/);
 // West side: approach the grass, independent of the editor rectangle.
 sim.pose={x:40,z:400,heading:-Math.PI/2};sim.speed=20;
 for(let i=0;i<240;i++)sim.step({...released(),forward:true},1/120);
 assert.equal(sim.collision,'boundary');assert.equal(sim.speed,0);assert.ok(sim.pose.x>5);
});
test('venue source export contains venue GLB, elevations and correct surface keys',()=>{
 const layout=venueLayout();layout.items.push({id:'start',kind:'start',x:480,z:470,angle:0},{id:'finish',kind:'finish',x:480,z:450,angle:0});
 assert.throws(()=>buildExport(layout),/venue model/);
 const bytes=gunzipSync(readFileSync(new URL('../public/venue/lincoln.glb.gz',import.meta.url)));
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x46546c67);
 const bundle=buildExport(layout,bytes,road);
 assert.equal(bundle.files['lincoln.glb'],bytes);
 const script=strFromU8(bundle.files['build_track.py']);assert.match(script,/bpy.ops.import_scene.gltf/);assert.match(script,/obj.location=\(x,-z,elevation\)/);
 const elevations=JSON.parse(strFromU8(bundle.files['elevations.json']));assert.equal(elevations['lincoln-stage'],road.height(480,480));
 assert.match(strFromU8(bundle.files[`${bundle.slug}/data/surfaces.ini`]),/KEY=PROAD/);
});

test('venue example preserves every object and calibrated distance with a single translation',()=>{
 const flat=demoLayout(),overlay=demoLayout('lincoln');
 assert.equal(overlay.venue,'lincoln');assert.equal(overlay.columns,VENUE.columns);assert.equal(overlay.rows,VENUE.rows);
 assert.equal(overlay.items.length,flat.items.length);assert.equal(overlay.items.filter(i=>i.kind==='stage').length,1);
 for(let i=0;i<flat.items.length;i++){
  const original=flat.items[i],moved=overlay.items[i];
  assert.deepEqual({...moved,x:original.x,z:original.z},original);
  assert.ok(Math.abs(moved.x-original.x-EXAMPLE_VENUE_OFFSET.x)<1e-10);
  assert.ok(Math.abs(moved.z-original.z-EXAMPLE_VENUE_OFFSET.z)<1e-10);
  assert.notEqual(road.height(moved.x,moved.z),null,`Object ${moved.id} must stay on the venue surface`);
 }
 const cone=(n:number)=>overlay.items.find(i=>i.id===`nats-east-2026-cone-${n}`)!;
 assert.ok(Math.abs(Math.hypot(cone(138).x-cone(139).x,cone(138).z-cone(139).z)-75*FOOT)<1e-10);
 for(const value of [cone(102).x,cone(102).z])assert.ok(Math.abs(value/PAD-Math.round(value/PAD))<1e-10);
 assert.doesNotThrow(()=>new DrivingSimulation(overlay,undefined,road));
 assert.equal(demoLayout().venue,undefined);assert.deepEqual(demoLayout(),flat);
});

test('legacy courses migrate onto permanent venue without scaling, and migration is idempotent',()=>{
 const source=demoLayout();const migrated=onVenue(source);assert.deepEqual(migrated,demoLayout('lincoln'));assert.deepEqual(onVenue(migrated),migrated);assert.equal(source.venue,undefined);
 const custom={version:1 as const,name:'Custom',columns:24,rows:16,items:[{id:'a',kind:'cone' as const,x:10,z:20,angle:30},{id:'b',kind:'cone' as const,x:20,z:40,angle:75}]};
 const result=onVenue(custom);assert.equal(result.venue,'lincoln');assert.equal(result.items[1].x-result.items[0].x,10);assert.ok(Math.abs(result.items[1].z-result.items[0].z-20)<1e-10);assert.equal(result.items[0].angle,30);
 assert.throws(()=>onVenue({...custom,columns:160,items:[{...custom.items[0],x:1000}]}),/too large/);
});
