import {normalizeSetup,type CarSetup} from './car-setup';
import {CONE_BASE,CONE_HEIGHT,PAD,POINTER_TILT,type Item,type Layout} from './model';
export const CAR={width:1.8,length:4.2,wheelbase:2.5,eyeHeight:1.1,maxSpeed:29,reverseSpeed:5,tireGrip:12.8};
export type Controls={forward:boolean;backward:boolean;left:boolean;right:boolean};
export const released=():Controls=>({forward:false,backward:false,left:false,right:false});
export type Pose={x:number;z:number;heading:number};
type Box=Pose&{halfWidth:number;halfLength:number};
const carBox=(p:Pose):Box=>({...p,halfWidth:CAR.width/2,halfLength:CAR.length/2});
const axes=(p:Pose)=>[{x:Math.cos(p.heading),z:Math.sin(p.heading)},{x:Math.sin(p.heading),z:-Math.cos(p.heading)}];
function overlaps(a:Box,b:Box){
 const aa=axes(a),bb=axes(b),dx=b.x-a.x,dz=b.z-a.z;
 for(const axis of [...aa,...bb]){
  const projection=(v:{x:number;z:number})=>Math.abs(v.x*axis.x+v.z*axis.z);
  const ra=a.halfWidth*projection(aa[0])+a.halfLength*projection(aa[1]);
  const rb=b.halfWidth*projection(bb[0])+b.halfLength*projection(bb[1]);
  if(Math.abs(dx*axis.x+dz*axis.z)>ra+rb)return false;
 }
 return true;
}
export function crossesGate(from:Pose,to:Pose,gate:Item){
 const a=gate.angle*Math.PI/180,f={x:Math.sin(a),z:-Math.cos(a)},r={x:Math.cos(a),z:Math.sin(a)};
 const before=(from.x-gate.x)*f.x+(from.z-gate.z)*f.z,after=(to.x-gate.x)*f.x+(to.z-gate.z)*f.z;
 if(before>=0||after<0)return false;
 const t=-before/(after-before),x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
 return Math.abs((x-gate.x)*r.x+(z-gate.z)*r.z)<=(gate.width??6.096)/2;
}
export class DrivingSimulation {
 readonly layout:Layout;
 setup:CarSetup;
 pose:Pose; speed=0; steering=0; clock=0; startedAt:number|null=null; finishedAt:number|null=null;
 collision:'cone'|'boundary'|null=null;
 longitudinalAcceleration=0; lateralAcceleration=0; yawRate=0; throttle=0;
 private brake=0;
 private spawn:Pose;
 private blockedDirection=0;
 private obstacles:Box[];
 constructor(layout:Layout,setup?:Partial<CarSetup>){
  this.setup=normalizeSetup(setup);
  this.layout=structuredClone(layout);
  const stage=layout.items.find(i=>i.kind==='stage');
  if(!stage)throw Error('Place a staging point before driving.');
  this.spawn={x:stage.x,z:stage.z,heading:stage.angle*Math.PI/180};this.pose={...this.spawn};
  this.obstacles=layout.items.filter(i=>i.kind==='cone'||i.kind==='pointer').map(i=>{
   const heading=i.angle*Math.PI/180;
   if(i.kind==='pointer'){
    const length=(CONE_HEIGHT-.02)*Math.cos(POINTER_TILT)+.04;
    const offset=(length-.04)/2;
    return {x:i.x+Math.sin(heading)*offset,z:i.z-Math.cos(heading)*offset,heading,halfWidth:CONE_BASE/2,halfLength:length/2};
   }
   return {x:i.x,z:i.z,heading,halfWidth:CONE_BASE/2,halfLength:CONE_BASE/2};
  });
  const collision=this.blocked(this.pose);
  if(collision)throw Error(collision==='cone'?'Staging overlaps a cone. Move staging to clear space.':'Staging is too close to the site edge. Move it inward.');
 }
 reset(){this.pose={...this.spawn};this.speed=0;this.steering=0;this.clock=0;this.startedAt=null;this.finishedAt=null;this.collision=null;this.blockedDirection=0;this.longitudinalAcceleration=0;this.lateralAcceleration=0;this.yawRate=0;this.throttle=0;this.brake=0;}
 get elapsed(){return this.startedAt===null?0:(this.finishedAt??this.clock)-this.startedAt;}
 private blocked(pose:Pose):'cone'|'boundary'|null {
  const box=carBox(pose),[right,forward]=axes(pose);
  const ex=Math.abs(right.x)*box.halfWidth+Math.abs(forward.x)*box.halfLength;
  const ez=Math.abs(right.z)*box.halfWidth+Math.abs(forward.z)*box.halfLength;
  if(pose.x-ex<0||pose.z-ez<0||pose.x+ex>this.layout.columns*PAD||pose.z+ez>this.layout.rows*PAD)return 'boundary';
  for(const obstacle of this.obstacles){if(Math.abs(obstacle.x-pose.x)>3||Math.abs(obstacle.z-pose.z)>3)continue;if(overlaps(box,obstacle))return 'cone';}
  return null;
 }
 step(input:Controls,delta:number){
  // Cap stalls and substep both translation and rotation to prevent tunneling.
  let remaining=Math.min(Math.max(delta,0),.1);
  while(remaining>1e-8){const dt=Math.min(remaining,1/120);this.tick(input,dt);remaining-=dt;}
 }
 private tick(input:Controls,dt:number){
  this.clock+=dt;
  const velocity=Math.abs(this.speed);
  // Keyboard input moves the steering rack progressively; road speed reduces lock.
  const target=((input.right?1:0)-(input.left?1:0))*.55*this.setup.steering/(1+velocity*.025);
  const steeringRate=(target===0?1.6:1.05)*this.setup.response/(1+velocity*.035);
  this.steering+=Math.max(-steeringRate*dt,Math.min(steeringRate*dt,target-this.steering));
  this.longitudinalAcceleration=0;this.lateralAcceleration=0;
  if((this.blockedDirection>0&&input.forward&&!input.backward)||(this.blockedDirection<0&&input.backward&&!input.forward)){this.speed=0;this.yawRate=0;this.throttle=0;return;}
  this.blockedDirection=0;
  const braking=(input.forward&&input.backward)||(input.backward&&this.speed>.1)||(input.forward&&this.speed<-.1);
  const drive=braking?0:input.forward?1:input.backward?-1:0;
  this.throttle+=(drive-this.throttle)*(1-Math.exp(-dt*7));
  this.brake+=((braking?1:0)-this.brake)*(1-Math.exp(-dt*18));
  const resistance=velocity>.01?Math.sign(this.speed)*(.22+.0045*velocity*velocity+(drive===0?.55:0)):0;
  // Power falls with speed; braking and cornering share a finite tire-grip budget.
  const engine=this.setup.acceleration*this.throttle*(this.throttle>=0?Math.min(5.7,70/Math.max(velocity,1)):3);
  const grip=this.setup.grip;
  const availableLongitudinal=Math.sqrt(Math.max(0,grip*grip-Math.min(grip*.9,Math.abs(this.yawRate*this.speed))**2));
  const force=engine-Math.sign(this.speed)*this.brake*10.5*this.setup.braking-resistance;
  const acceleration=Math.max(-availableLongitudinal,Math.min(availableLongitudinal,force));
  const previousSpeed=this.speed,next=this.speed+acceleration*dt;
  if((braking||drive===0)&&Math.sign(next)!==Math.sign(this.speed))this.speed=0;
  else this.speed=Math.max(-CAR.reverseSpeed,Math.min(this.setup.topSpeed/2.236936,next));
  this.longitudinalAcceleration=(this.speed-previousSpeed)/dt;
  const availableLateral=Math.sqrt(Math.max(0,grip*grip-Math.min(grip*.95,Math.abs(this.longitudinalAcceleration))**2));
  const desiredYaw=this.speed/CAR.wheelbase*Math.tan(this.steering)/(1+.0008*this.speed*this.speed);
  const yawLimit=availableLateral/Math.max(Math.abs(this.speed),.5);
  const targetYaw=Math.max(-yawLimit,Math.min(yawLimit,desiredYaw));
  this.yawRate+=(targetYaw-this.yawRate)*(1-Math.exp(-dt*9*this.setup.response));
  if(Math.abs(this.speed)<.02)this.yawRate=0;
  this.lateralAcceleration=this.yawRate*this.speed;
  const rotation=this.yawRate*dt;
  const steps=Math.max(1,Math.ceil((Math.abs(this.speed)*dt+Math.abs(rotation)*CAR.length)/.08));
  for(let n=0;n<steps;n++){
   const heading=this.pose.heading+rotation/steps;
   const candidate={heading,x:this.pose.x+Math.sin(heading)*this.speed*dt/steps,z:this.pose.z-Math.cos(heading)*this.speed*dt/steps};
   const hit=this.blocked(candidate);
   if(hit){this.blockedDirection=Math.sign(this.speed);this.speed=0;this.yawRate=0;this.throttle=0;this.lateralAcceleration=0;this.collision=hit;return;}
   if(Math.abs(this.speed)>.05)this.collision=null;
   const start=this.layout.items.find(i=>i.kind==='start'),finish=this.layout.items.find(i=>i.kind==='finish');
   if(this.startedAt===null&&start&&crossesGate(this.pose,candidate,start))this.startedAt=this.clock;
   if(this.startedAt!==null&&this.finishedAt===null&&finish&&crossesGate(this.pose,candidate,finish))this.finishedAt=this.clock;
   this.pose=candidate;
  }
 }
}
