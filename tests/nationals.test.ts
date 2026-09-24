import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {demoLayout,FOOT,PAD,validateLayout} from '../src/model.ts';
const trace=JSON.parse(readFileSync(new URL('../data/nationals-east-2026-trace.json',import.meta.url),'utf8'));
const calibration=JSON.parse(readFileSync(new URL('../data/nationals-east-2026-calibration.json',import.meta.url),'utf8'));
test('138–139 sets scale; cone 102 anchors a four-way joint without rotation',()=>{
 const l=demoLayout();const a=l.items.find(i=>i.id.endsWith('cone-138'))!,b=l.items.find(i=>i.id.endsWith('cone-139'))!,anchor=l.items.find(i=>i.id.endsWith('cone-102'))!;
 assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-75*FOOT)<1e-10);
 for(const n of [anchor.x,anchor.z])assert.ok(Math.abs(n/PAD-Math.round(n/PAD))<1e-10);
 assert.equal(calibration.rotationDegrees,0);assert.equal(l.viewAngle,0);
 assert.ok(Math.abs(a.x-b.x)>1); // Do not force these separate cone positions onto one seam.
});
test('the example contains all traced cones and separate staging and start markers',()=>{
 const l=demoLayout();assert.equal(l.items.filter(i=>i.kind==='cone').length,217);assert.equal(l.items.filter(i=>i.kind==='pointer').length,84);
 assert.equal(l.items.filter(i=>i.kind==='start').length,1);assert.equal(l.items.filter(i=>i.kind==='finish').length,0);
 for(const [start,end] of [[101,140],[201,229],[301,353],[401,443],[501,552]])for(let n=start;n<=end;n++)assert.ok(l.items.some(i=>i.id===`nats-east-2026-cone-${n}`));
 assert.deepEqual(validateLayout(l),l);assert.equal(l.columns*25,calibration.siteFeet.width);assert.equal(l.rows*25,calibration.siteFeet.depth);
 // Loading creates independent editable objects with reproducible wear IDs.
 l.items[0].x=0;assert.notEqual(demoLayout().items[0].x,0);
});
test('the trace uses one uniform scale, with no geometric stretching',()=>{
 const l=demoLayout();
 for(let n=1;n<trace.cones.length;n++){
  const a=trace.cones[n-1],b=trace.cones[n];const x=l.items.find(i=>i.id===`nats-east-2026-cone-${a.number}`)!,y=l.items.find(i=>i.id===`nats-east-2026-cone-${b.number}`)!;
  assert.ok(Math.abs(Math.hypot(x.x-y.x,x.z-y.z)-Math.hypot(a.x-b.x,a.y-b.y)*calibration.metersPerPixel)<1e-9);
 }
});

test('Nationals staging is centered between 101 and 102 and faces the entry lane',()=>{
 const l=demoLayout();const cone=(n:number)=>l.items.find(i=>i.id===`nats-east-2026-cone-${n}`)!;
 const stage=l.items.find(i=>i.kind==='stage')!,start=l.items.find(i=>i.kind==='start')!;
 assert.equal(stage.x,(cone(101).x+cone(102).x)/2);assert.equal(stage.z,(cone(101).z+cone(102).z)/2);
 const dx=(cone(103).x+cone(104).x)/2-stage.x,dz=(cone(103).z+cone(104).z)/2-stage.z;
 const angle=stage.angle*Math.PI/180;
 assert.ok(Math.abs(Math.sin(angle)-dx/Math.hypot(dx,dz))<1e-10);
 assert.ok(Math.abs(-Math.cos(angle)-dz/Math.hypot(dx,dz))<1e-10);
 assert.ok(Math.hypot(stage.x-start.x,stage.z-start.z)>20);
});
