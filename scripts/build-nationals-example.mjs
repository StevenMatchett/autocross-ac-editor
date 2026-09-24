import { readFileSync, writeFileSync } from 'node:fs';
const trace=JSON.parse(readFileSync(new URL('../data/nationals-east-2026-trace.json',import.meta.url),'utf8'));
const FOOT=.3048,PAD=25*FOOT;
const first=trace.cones.find(c=>c.number===138),second=trace.cones.find(c=>c.number===139);
// Distance and grid position are independent references. 138–139 sets only
// the uniform scale. Cone 102 anchors a four-way joint; PDF axes set orientation.
const dx=first.x-second.x,dy=first.y-second.y;
const rotation=0,metersPerPixel=75*FOOT/Math.hypot(dx,dy);
const anchor=trace.cones.find(c=>c.number===trace.gridReference.cone);
function position(p){return {x:(p.x-anchor.x)*metersPerPixel,z:(p.y-anchor.y)*metersPerPixel};}
const raw=[...trace.cones,...trace.pointers].map(position);
const offsetX=Math.ceil((PAD-Math.min(...raw.map(p=>p.x)))/PAD)*PAD;
const offsetZ=Math.ceil((PAD-Math.min(...raw.map(p=>p.z)))/PAD)*PAD;
const point=p=>{const q=position(p);return {x:q.x+offsetX,z:q.z+offsetZ};};
const heading=a=>(a+rotation*180/Math.PI+360)%360;
const items=trace.cones.map(c=>({id:`nats-east-2026-cone-${c.number}`,kind:'cone',...point(c),angle:heading(0)}));
for(const p of trace.pointers)items.push({id:`nats-east-2026-pointer-${p.id}`,kind:'pointer',...point(p),angle:heading(p.angle)});
const [a,b]=trace.start.between.map(n=>point(trace.cones.find(c=>c.number===n)));
items.push({id:'nats-east-2026-start',kind:'start',x:(a.x+b.x)/2,z:(a.z+b.z)/2,angle:heading(trace.start.angle),width:Math.hypot(a.x-b.x,a.z-b.z)});
const cone=n=>point(trace.cones.find(c=>c.number===n));
const c101=cone(101),c102=cone(102),c103=cone(103),c104=cone(104);
const staging={x:(c101.x+c102.x)/2,z:(c101.z+c102.z)/2};
const approach={x:(c103.x+c104.x)/2,z:(c103.z+c104.z)/2};
const stagingHeading=(Math.atan2(approach.x-staging.x,-(approach.z-staging.z))*180/Math.PI+360)%360;
items.push({id:'nats-east-2026-stage',kind:'stage',...staging,angle:stagingHeading});
// No model or camera rotation: preserve the source drawing orientation.
const layout={version:1,name:'2026 Nationals — East',viewAngle:0,columns:Math.ceil((Math.max(...items.map(i=>i.x))+PAD)/PAD),rows:Math.ceil((Math.max(...items.map(i=>i.z))+PAD)/PAD),items};
writeFileSync(new URL('../src/examples/nationals-east-2026.json',import.meta.url),JSON.stringify(layout,null,2)+'\n');
const calibration={referenceCones:[138,139],referenceFeet:75,metersPerPixel,rotationDegrees:rotation*180/Math.PI,gridReference:trace.gridReference,anchorMeters:{x:offsetX,z:offsetZ},siteFeet:{width:layout.columns*25,depth:layout.rows*25},uprightCones:trace.cones.length,pointerCones:trace.pointers.length};
writeFileSync(new URL('../data/nationals-east-2026-calibration.json',import.meta.url),JSON.stringify(calibration,null,2)+'\n');
console.log(calibration);
