import {normalizeSetup,SETUP_FIELDS,SETUP_STORAGE} from './car-setup';
import * as THREE from 'three';
import {createCourseScene,disposeScene} from './course-scene';
import {CAR,DrivingSimulation,released,type Controls} from './driving';
import type {Layout} from './model';

export function openDrivingTester(layout:Layout){
 let saved:unknown;
 try{saved=JSON.parse(localStorage.getItem(SETUP_STORAGE)??'null');}catch{saved=null;}
 const simulation=new DrivingSimulation(layout,normalizeSetup(saved));
 const dialog=document.createElement('dialog');dialog.id='drive-dialog';dialog.setAttribute('aria-label','Drive course');
 dialog.innerHTML=`<div class="drive-top"><strong>Drive course</strong><div><button id="drive-setup-toggle" aria-expanded="false" aria-controls="drive-setup">Car setup</button><button id="drive-pause">Pause</button><button id="drive-reset">Reset <kbd>R</kbd></button><button id="drive-close">Back to editor <kbd>Esc</kbd></button></div></div><div id="drive-viewport"><section id="drive-setup" aria-label="Car setup" hidden><div class="drive-setup-heading"><strong>Car setup</strong><button id="drive-setup-close" aria-label="Close car setup">×</button></div>${SETUP_FIELDS.map(f=>`<label for="setup-${f.key}">${f.label}<output id="value-${f.key}" for="setup-${f.key}"></output></label><input id="setup-${f.key}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" data-setup="${f.key}">`).join('')}<button id="drive-setup-defaults">Restore defaults</button></section><div id="drive-message" role="status"></div><div class="drive-instruments"><div><strong id="drive-speed">0</strong><span>mph</span><b id="drive-gear">N</b></div><div class="drive-timing"><span id="drive-run-state">Staged</span><strong id="drive-time">0.000</strong><small>s</small></div></div><div class="drive-touch" aria-label="Driving controls"><button data-control="left" aria-label="Steer left">A</button><button data-control="right" aria-label="Steer right">D</button><button data-control="backward" aria-label="Brake and reverse">S</button><button data-control="forward" aria-label="Accelerate">W</button></div></div><div class="drive-help"><span><kbd>W</kbd> Accelerate <kbd>S</kbd> Brake / reverse <kbd>A</kbd> <kbd>D</kbd> Steer</span><span>Course tester · simplified handling</span></div>`;
 document.body.append(dialog);dialog.showModal();
 const host=dialog.querySelector<HTMLElement>('#drive-viewport')!;
 let renderer:THREE.WebGLRenderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true});}
 catch{dialog.close();dialog.remove();throw Error('Driving requires WebGL. Enable hardware acceleration in your browser.');}
 const scene=createCourseScene(simulation.layout);scene.background=new THREE.Color('#b8cbd8');scene.fog=new THREE.Fog('#c8d2d6',150,700);
 const camera=new THREE.PerspectiveCamera(72,1,.03,1200);
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(host.clientWidth,host.clientHeight);host.prepend(renderer.domElement);
 renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','First-person driving view');
 // A small visible hood provides a stable reference for car width and steering.
 const car=new THREE.Group();const hood=new THREE.Mesh(new THREE.BoxGeometry(1.65,.12,1.35),new THREE.MeshStandardMaterial({color:0x334552,roughness:.5,metalness:.35}));
 hood.position.set(0,.67,-1.2);car.add(hood);
 const dash=new THREE.Mesh(new THREE.BoxGeometry(1.65,.1,.24),new THREE.MeshStandardMaterial({color:0x20272b,roughness:.9}));dash.position.set(0,.76,-.42);car.add(dash);scene.add(car);
 const wheel=new THREE.Group();wheel.position.set(-.32,.86,-.64);wheel.rotation.x=-.3;
 const wheelFace=new THREE.Group();wheel.add(wheelFace);
 const wheelMaterial=new THREE.MeshStandardMaterial({color:0x14191c,roughness:.85});
 wheelFace.add(new THREE.Mesh(new THREE.TorusGeometry(.175,.018,10,40),wheelMaterial));
 const hub=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.035,20),wheelMaterial);hub.rotation.x=Math.PI/2;wheelFace.add(hub);
 for(const angle of [Math.PI/2,-Math.PI/2,Math.PI]){
  const spoke=new THREE.Mesh(new THREE.BoxGeometry(.024,.145,.018),wheelMaterial);
  spoke.position.set(Math.sin(angle)*.09,Math.cos(angle)*.09,0);spoke.rotation.z=-angle;wheelFace.add(spoke);
 }
 car.add(wheel);
 let bodyPitch=0,bodyRoll=0;

 const speed=dialog.querySelector('#drive-speed')!,gear=dialog.querySelector('#drive-gear')!,time=dialog.querySelector('#drive-time')!,state=dialog.querySelector('#drive-run-state')!,message=dialog.querySelector<HTMLElement>('#drive-message')!;
 const pauseButton=dialog.querySelector<HTMLButtonElement>('#drive-pause')!;
 const events=new AbortController();const options={signal:events.signal};
 let controls:Controls=released(),paused=false,frame=0,last=performance.now(),accumulator=0,disposed=false,contextLost=false;
 const clear=()=>{controls=released();dialog.querySelectorAll('[data-control]').forEach(b=>b.classList.remove('pressed'));};
 const pause=(value:boolean)=>{paused=value;clear();accumulator=0;last=performance.now();pauseButton.textContent=paused?'Resume':'Pause';updateHUD();};
 const reset=()=>{simulation.reset();bodyPitch=0;bodyRoll=0;clear();accumulator=0;last=performance.now();updateHUD();renderer.domElement.focus();};
 const panel=dialog.querySelector<HTMLElement>('#drive-setup')!;
 const setupToggle=dialog.querySelector<HTMLButtonElement>('#drive-setup-toggle')!;
 const saveSetup=()=>{try{localStorage.setItem(SETUP_STORAGE,JSON.stringify(simulation.setup));}catch{/* Keep tuning available when storage is unavailable. */}};
 const syncSetup=()=>{for(const field of SETUP_FIELDS){
  const input=dialog.querySelector<HTMLInputElement>(`#setup-${field.key}`)!;
  input.value=String(simulation.setup[field.key]);
  dialog.querySelector(`#value-${field.key}`)!.textContent=`${Number(input.value).toFixed(field.step===1?0:field.step===.1?1:2)} ${field.unit}`;
 }};
 const showSetup=(show:boolean)=>{panel.hidden=!show;setupToggle.setAttribute('aria-expanded',String(show));if(show)pause(true);else setupToggle.focus();};
 setupToggle.addEventListener('click',()=>showSetup(panel.hidden),options);
 dialog.querySelector('#drive-setup-close')!.addEventListener('click',()=>showSetup(false),options);
 dialog.querySelector('#drive-setup-defaults')!.addEventListener('click',()=>{simulation.setup=normalizeSetup(null);syncSetup();saveSetup();},options);
 for(const field of SETUP_FIELDS)dialog.querySelector(`#setup-${field.key}`)!.addEventListener('input',e=>{
  simulation.setup=normalizeSetup({...simulation.setup,[field.key]:Number((e.target as HTMLInputElement).value)});syncSetup();saveSetup();
 },options);
 syncSetup();
 const keyMap:Record<string,keyof Controls>={KeyW:'forward',KeyS:'backward',KeyA:'left',KeyD:'right'};
 window.addEventListener('keydown',e=>{
  if(e.target instanceof HTMLInputElement)return;
  const key=keyMap[e.code];
  if(key){e.preventDefault();e.stopPropagation();if(!paused)controls[key]=true;}
  else if(e.code==='KeyR'){e.preventDefault();e.stopPropagation();if(!e.repeat)reset();}
  else if(e.code==='Space'){e.preventDefault();e.stopPropagation();if(!e.repeat){if(paused)showSetup(false);pause(!paused);}}
 },{...options,capture:true});
 window.addEventListener('keyup',e=>{const key=keyMap[e.code];if(key){e.preventDefault();e.stopPropagation();controls[key]=false;}},{...options,capture:true});
 window.addEventListener('blur',()=>pause(true),options);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);},options);
 dialog.querySelector('#drive-reset')!.addEventListener('click',reset,options);
 pauseButton.addEventListener('click',()=>{if(paused)showSetup(false);pause(!paused);renderer.domElement.focus();},options);
 dialog.querySelector('#drive-close')!.addEventListener('click',()=>dialog.close(),options);
 for(const button of dialog.querySelectorAll<HTMLElement>('[data-control]')){
  const control=button.dataset.control as keyof Controls;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(!paused){controls[control]=true;button.classList.add('pressed');}},options);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{controls[control]=false;button.classList.remove('pressed');},options);
 }
 function updateHUD(){
  speed.textContent=String(Math.round(Math.abs(simulation.speed)*2.236936));gear.textContent=simulation.speed<-.05?'R':simulation.speed>.05?'D':'N';
  time.textContent=simulation.elapsed.toFixed(3);
  state.textContent=simulation.finishedAt!==null?'Finished':simulation.startedAt!==null?'Running':simulation.layout.items.some(i=>i.kind==='start')?'Before start':'Free drive';
  message.textContent=contextLost?'Graphics context lost. Return to the editor and reopen Drive.':paused?'Paused':simulation.collision==='cone'?'Cone hit — stopped':simulation.collision==='boundary'?'Site edge — stopped':'';
  message.hidden=!message.textContent;
 }
 const resize=new ResizeObserver(()=>{if(!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();});resize.observe(host);
 function render(now:number){
  if(disposed||contextLost)return;
  frame=requestAnimationFrame(render);
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(!paused){accumulator+=dt;while(accumulator>=1/120){simulation.step(controls,1/120);accumulator-=1/120;}}
  const {x,z,heading}=simulation.pose,forward=new THREE.Vector3(Math.sin(heading),0,-Math.cos(heading));
  camera.position.set(x-.32*Math.cos(heading),CAR.eyeHeight,z-.32*Math.sin(heading));
  const settle=1-Math.exp(-dt*5);
  bodyPitch+=((paused?bodyPitch:simulation.longitudinalAcceleration*.0025)-bodyPitch)*settle;
  bodyRoll+=((paused?bodyRoll:simulation.lateralAcceleration*.002)-bodyRoll)*settle;
  camera.lookAt(camera.position.clone().add(forward.multiplyScalar(30)).add(new THREE.Vector3(0,-.6+bodyPitch*30,0)));
  camera.rotateZ(-bodyRoll);
  const fov=72+Math.min(3,Math.abs(simulation.speed)*.1);
  if(Math.abs(camera.fov-fov)>.01){camera.fov=fov;camera.updateProjectionMatrix();}
  wheelFace.rotation.z=-simulation.steering*12;

  car.position.set(x,0,z);car.rotation.y=-heading;
  updateHUD();renderer.render(scene,camera);
 }
 const cleanup=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);events.abort();resize.disconnect();clear();disposeScene(scene);renderer.dispose();renderer.forceContextLoss();dialog.remove();document.querySelector<HTMLElement>('#drive')?.focus();};
 dialog.addEventListener('close',cleanup,{once:true});
 renderer.domElement.addEventListener('webglcontextlost',e=>{if(disposed)return;e.preventDefault();contextLost=true;cancelAnimationFrame(frame);pause(true);},{...options});
 renderer.domElement.focus();camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();frame=requestAnimationFrame(render);
}
