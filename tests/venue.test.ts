import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync,strFromU8} from 'fflate';
import {RoadSurface} from '../src/road-surface.ts';
import {venueLayout,VENUE} from '../src/venue.ts';
import {validateLayout} from '../src/model.ts';
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
