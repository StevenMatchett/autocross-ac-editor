import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DrivingSimulation,released,crossesGate,CAR,type Controls} from '../src/driving.ts';
import {emptyLayout,demoLayout,type Layout,type Item} from '../src/model.ts';
function course():Layout {const l=emptyLayout();l.items=[{id:'stage',kind:'stage',x:30,z:60,angle:0},{id:'start',kind:'start',x:30,z:50,angle:0},{id:'finish',kind:'finish',x:30,z:30,angle:0}];return l;}
function run(s:DrivingSimulation,input:Partial<Controls>,seconds:number){for(let n=0;n<seconds*120;n++)s.step({...released(),...input},1/120);}
test('W drives forward, A/D steer, and S brakes then reverses',()=>{
 const s=new DrivingSimulation(course());run(s,{forward:true},1);assert.ok(s.pose.z<60&&s.speed>0);
 const initialHeading=s.pose.heading;run(s,{forward:true,right:true},.5);assert.ok(s.pose.heading>initialHeading);assert.ok(s.pose.x>30);
 run(s,{backward:true},2);assert.ok(s.speed<0);
 s.reset();run(s,{forward:true,left:true},1);assert.ok(s.pose.heading<0);assert.ok(s.pose.x<30);
});
for(const kind of ['cone','pointer'] as const)test(`${kind} contact completely stops the car without moving the cone`,()=>{
 const l=course();const cone:Item={id:'obstacle',kind,x:30,z:50,angle:90};l.items.push(cone);
 const s=new DrivingSimulation(l);run(s,{forward:true},4);
 assert.equal(s.speed,0);assert.equal(s.collision,'cone');assert.ok(s.pose.z>52);
 const stopped={...s.pose};run(s,{forward:true},.5);assert.deepEqual(s.pose,stopped);
 assert.deepEqual(l.items.at(-1),cone);run(s,{backward:true},1);assert.ok(s.pose.z>stopped.z);assert.equal(s.collision,null);
});
test('fast travel cannot tunnel through a cone between frames',()=>{
 const l=course();l.items.push({id:'c',kind:'cone',x:30,z:30,angle:0});const s=new DrivingSimulation(l);s.pose.z=34;s.speed=CAR.maxSpeed;
 s.step({...released(),forward:true},.1);assert.equal(s.speed,0);assert.equal(s.collision,'cone');assert.ok(s.pose.z>32);
});
test('car body is stopped at the site boundary and reset returns to staging',()=>{
 const s=new DrivingSimulation(course());s.pose.z=2.2;s.speed=5;s.step({...released(),forward:true},.1);
 assert.equal(s.speed,0);assert.equal(s.collision,'boundary');assert.ok(s.pose.z>=CAR.length/2);
 s.reset();assert.deepEqual(s.pose,{x:30,z:60,heading:0});assert.equal(s.elapsed,0);assert.equal(s.collision,null);
});
test('timer starts on forward start crossing and freezes at finish',()=>{
 const s=new DrivingSimulation(course());run(s,{forward:true},1);assert.equal(s.startedAt,null);
 run(s,{forward:true},3);assert.notEqual(s.startedAt,null);assert.notEqual(s.finishedAt,null);const elapsed=s.elapsed;
 run(s,{backward:true},1);assert.equal(s.elapsed,elapsed);s.reset();assert.equal(s.startedAt,null);assert.equal(s.finishedAt,null);
});
test('gate crossing is directional and limited to gate width',()=>{
 const gate=course().items[1];assert.ok(crossesGate({x:30,z:51,heading:0},{x:30,z:49,heading:0},gate));
 assert.ok(!crossesGate({x:30,z:49,heading:0},{x:30,z:51,heading:0},gate));
 assert.ok(!crossesGate({x:40,z:51,heading:0},{x:40,z:49,heading:0},gate));
});
test('blocked/missing staging is rejected; Nationals staging is driveable',()=>{
 assert.throws(()=>new DrivingSimulation(emptyLayout()),/staging/);
 const l=course();l.items.push({id:'bad',kind:'cone',x:30,z:60,angle:0});assert.throws(()=>new DrivingSimulation(l),/overlaps/);
 assert.doesNotThrow(()=>new DrivingSimulation(demoLayout()));
});
test('simulation uses a snapshot and does not modify the editor layout',()=>{
 const l=course(),before=structuredClone(l),s=new DrivingSimulation(l);run(s,{forward:true},2);assert.deepEqual(l,before);
 l.items[0].x=70;s.reset();assert.equal(s.pose.x,30);
});

test('high-speed steering stays within tire grip instead of turning on rails',()=>{
 const l=course();l.columns=100;l.rows=100;l.items=[{id:'stage',kind:'stage',x:300,z:300,angle:0}];
 const s=new DrivingSimulation(l);s.speed=25;
 run(s,{right:true},1);
 assert.ok(s.pose.heading>0);
 assert.ok(Math.abs(s.lateralAcceleration)<=CAR.tireGrip+.01);
 assert.ok(s.pose.heading<.65);
 assert.ok(s.lateralAcceleration>11,'sustained cornering uses the increased grip');
});
test('throttle builds progressively and braking stops sooner than coasting',()=>{
 const s=new DrivingSimulation(course());s.step({...released(),forward:true},1/120);
 assert.ok(s.throttle>0&&s.throttle<.1);
 const coast=new DrivingSimulation(course()),brake=new DrivingSimulation(course());coast.speed=15;brake.speed=15;
 run(coast,{},.8);run(brake,{backward:true},.8);
 assert.ok(brake.speed<coast.speed-4);
 assert.ok(brake.pose.z>coast.pose.z);
 brake.reset();assert.equal(brake.yawRate,0);assert.equal(brake.throttle,0);assert.equal(brake.longitudinalAcceleration,0);
});

test('car tuning changes acceleration, braking, steering, grip and top speed',()=>{
 const make=(setup={})=>{const l=course();l.columns=100;l.rows=100;l.items=[{id:'stage',kind:'stage',x:300,z:300,angle:0}];return new DrivingSimulation(l,setup);};
 const slow=make({acceleration:.5}),fast=make({acceleration:2});run(slow,{forward:true},1);run(fast,{forward:true},1);assert.ok(fast.speed>slow.speed*2);
 const weak=make({braking:.5}),strong=make({braking:2});weak.speed=strong.speed=20;run(weak,{backward:true},.5);run(strong,{backward:true},.5);assert.ok(strong.speed<weak.speed);
 const narrow=make({steering:.5,response:.5}),wide=make({steering:1.5,response:2});narrow.speed=wide.speed=5;run(narrow,{right:true},.3);run(wide,{right:true},.3);assert.ok(wide.pose.heading>narrow.pose.heading);
 const low=make({grip:7}),high=make({grip:20});low.speed=high.speed=25;run(low,{right:true},1);run(high,{right:true},1);assert.ok(high.pose.heading>low.pose.heading);
 const capped=make({topSpeed:25});run(capped,{forward:true},10);assert.ok(capped.speed<=25/2.236936);assert.ok(capped.speed>11);
 const invalid=make({grip:NaN,acceleration:-1,topSpeed:Infinity});assert.equal(invalid.setup.grip,12.8);assert.equal(invalid.setup.acceleration,.5);assert.equal(invalid.setup.topSpeed,65);
});
