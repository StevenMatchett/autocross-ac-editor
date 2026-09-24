import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitView,rotatePoint} from '../src/view.ts';
import {demoLayout,PAD} from '../src/model.ts';
import {readFileSync} from 'node:fs';
test('example view matches PDF orientation and proportions at every traced cone',()=>{
 const l=demoLayout();const trace=JSON.parse(readFileSync(new URL('../data/nationals-east-2026-trace.json',import.meta.url),'utf8'));
 const calibration=JSON.parse(readFileSync(new URL('../data/nationals-east-2026-calibration.json',import.meta.url),'utf8'));
 const origin=trace.cones[0];const itemOrigin=l.items.find(i=>i.id===`nats-east-2026-cone-${origin.number}`)!;
 const projectedOrigin=rotatePoint({x:itemOrigin.x,y:itemOrigin.z},l.viewAngle!*Math.PI/180);
 for(const c of trace.cones){const i=l.items.find(i=>i.id===`nats-east-2026-cone-${c.number}`)!;const p=rotatePoint({x:i.x,y:i.z},l.viewAngle!*Math.PI/180);
 assert.ok(Math.abs((p.x-projectedOrigin.x)-(c.x-origin.x)*calibration.metersPerPixel)<1e-9);
 assert.ok(Math.abs((p.y-projectedOrigin.y)-(c.y-origin.y)*calibration.metersPerPixel)<1e-9);}
});
test('rotated view fits all site corners and supports inverse pointer coordinates',()=>{
 const l=demoLayout(),angle=2.822670843*Math.PI/180;
 for(const [width,height] of [[1220,866],[246,610]]){
  const v=fitView(width,height,l.columns*PAD,l.rows*PAD,angle);
  for(const p of [{x:0,y:0},{x:l.columns*PAD,y:0},{x:0,y:l.rows*PAD},{x:l.columns*PAD,y:l.rows*PAD}]){
   const q=rotatePoint(p,angle);const screen={x:q.x*v.scale+v.ox,y:q.y*v.scale+v.oy};
   assert.ok(screen.x>=49.99&&screen.x<=width-49.99);assert.ok(screen.y>=49.99&&screen.y<=height-49.99);
   const restored=rotatePoint({x:(screen.x-v.ox)/v.scale,y:(screen.y-v.oy)/v.scale},-angle);
   assert.ok(Math.hypot(restored.x-p.x,restored.y-p.y)<1e-9);
  }
 }
});
