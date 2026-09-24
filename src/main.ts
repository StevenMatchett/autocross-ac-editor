import './style.css';
import {rotatePoint,fitView} from './view';
import {coneColor} from './cone-material';
import {createIcons, MousePointer2, Triangle, Flag, MapPin, Hand, Undo2, Redo2, Download, Upload, Plus, Minus, Maximize, Box, X, Save, Grid2X2, Car} from 'lucide';
import {PAD,FOOT,CONE_BASE,CONE_HEIGHT,POINTER_TILT,emptyLayout,demoLayout,validateLayout,snap,type Layout,type Item} from './model';
import {buildExport,download} from './export';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const icon=(name:string)=>`<i data-lucide="${name}"></i>`;
let layout=emptyLayout();try{const stored=localStorage.getItem('padwork');if(stored)layout=validateLayout(JSON.parse(stored));}catch{}
let tool='cone',selected:string|null=null,scale=5,ox=0,oy=0,snapStep=FOOT,grid=true;
let history:string[]=[],future:string[]=[];
$('#app').innerHTML=`<header>
  <a class="brand" href="/" aria-label="Padwork home">${icon('grid-2x2')}<span>Padwork</span></a>
  <input id="course-name" aria-label="Course name" maxlength="120">
  <div class="header-actions"><span id="save-state">Saved locally</span><button id="open">${icon('upload')} Open</button><button id="save">${icon('save')} Save</button><button class="primary" id="export">${icon('download')} Export</button></div>
</header>
<div class="workspace">
  <aside class="left">
    <section class="site-settings"><h2>Site</h2><p id="site-size"></p><div class="two-fields"><label>Columns<input type="number" id="columns" min="4" max="80"></label><label>Rows<input type="number" id="rows" min="4" max="80"></label></div><p class="subtle">Each pad is 25 × 25 ft.</p></section>
    <section class="placement"><label class="setting">Snap<select id="snap"><option value="0">Off</option><option value="1" selected>1 ft</option><option value="5">5 ft</option><option value="25">25 ft</option></select></label><label class="setting">Show pad grid<input type="checkbox" id="grid" checked></label></section>
    <section id="inspector" hidden><div id="properties"></div></section>
    <div class="sidebar-bottom"><button id="demo" title="2026 Solo Nationals East course">Load example</button><button id="new">New course</button></div>
  </aside>
  <main>
    <div class="toolbar"><div class="tools" role="toolbar" aria-label="Drawing tools">${[['select','mouse-pointer-2','Select','V'],['cone','triangle','Cone','C'],['pointer','triangle','Pointer','P'],['stage','car','Stage','G'],['start','map-pin','Start','S'],['finish','flag','Finish','F'],['pan','hand','Pan','H']].map(([id,ic,label,key])=>`<button data-tool="${id}" title="${label} (${key})" aria-label="${label}" aria-pressed="false">${icon(ic)}<span>${label}</span></button>`).join('')}</div><div class="history"><button id="undo" title="Undo (Ctrl+Z)" aria-label="Undo">${icon('undo-2')}</button><button id="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">${icon('redo-2')}</button></div><div class="view-actions"><button id="drive" class="primary" title="Drive course (WASD)">${icon('car')}<span>Drive</span></button><button id="preview" aria-label="3D preview" title="3D preview">${icon('box')}<span>3D preview</span></button><button id="help" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">?</button></div></div>
    <div class="canvas-wrap"><canvas id="map" aria-label="Autocross map. Choose a tool and click to place objects."></canvas><div class="compass" aria-label="North">N<span>↑</span></div><div class="canvas-bottom"><div class="hint" id="tool-hint"></div><div class="zoom"><button id="zoom-out" aria-label="Zoom out">${icon('minus')}</button><span id="zoom-level"></span><button id="zoom-in" aria-label="Zoom in">${icon('plus')}</button><button id="fit" aria-label="Fit site" title="Fit site">${icon('maximize')}</button></div></div></div>
    <footer><span id="coordinates">X — &nbsp; Y —</span><span class="cone-count"><b id="cone-count">0</b> cones</span><div id="gates"></div></footer>
  </main>
</div>
<input type="file" id="file" accept=".json" hidden><div id="toast" role="status"></div>
<dialog id="help-dialog" aria-labelledby="help-title"><button class="close" id="close-help" aria-label="Close">${icon('x')}</button><h2 id="help-title">Shortcuts</h2><dl class="shortcuts"><dt>Select / Cone / Pointer / Stage / Start / Finish / Pan</dt><dd>V / C / P / G / S / F / H</dd><dt>Zoom</dt><dd>Scroll</dd><dt>Pan</dt><dd>Space + drag</dd><dt>Rotate 15°</dt><dd>R</dd><dt>Delete selected</dt><dd>Delete</dd><dt>Undo</dt><dd>Ctrl / ⌘ Z</dd><dt>Redo</dt><dd>Ctrl / ⌘ Shift Z</dd></dl></dialog>
<dialog id="export-dialog" aria-labelledby="export-title"><button class="close" id="close-export" aria-label="Close">${icon('x')}</button><h2 id="export-title">Export track source</h2><p>Includes your layout, Blender generator, and track configuration.</p><ol><li>Generate the FBX in Blender.</li><li>Compile to KN5 with ksEditor.</li><li>Install and test in Assetto Corsa.</li></ol><p class="notice">Requires Blender and ksEditor. In-game compatibility is unverified. Cones export as fixed collision barriers.</p><button class="primary" id="download-package">${icon('download')} Download ZIP</button></dialog>
<dialog id="preview-dialog" aria-labelledby="preview-title"><div class="preview-heading"><h2 id="preview-title">3D preview</h2><button id="close-preview">${icon('x')} Close</button></div><div id="three"></div><p>Drag to orbit · Scroll to zoom · Right-drag to pan</p></dialog>
`;
createIcons({icons:{MousePointer2,Triangle,Flag,MapPin,Hand,Undo2,Redo2,Download,Upload,Plus,Minus,Maximize,Box,X,Save,Grid2X2, Car}});
const canvas=$<HTMLCanvasElement>('#map'),ctx=canvas.getContext('2d')!;
let width=0,height=0,autoFit=true;
function toast(message:string){$('#toast').textContent=message;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function remember(){history.push(JSON.stringify(layout));if(history.length>100)history.shift();future=[];}
function persist(){try{localStorage.setItem('padwork',JSON.stringify(layout));$('#save-state').textContent='Saved locally';}catch{$('#save-state').textContent='Storage full — save a file';}}
function change(){persist();sync();draw();}
function setTool(t:string){tool=t;document.querySelectorAll<HTMLElement>('[data-tool]').forEach(e=>{const active=e.dataset.tool===t;e.classList.toggle('active',active);e.setAttribute('aria-pressed',String(active));});$('#tool-hint').textContent=({cone:'Click to place; drag a cone to move',pointer:'Click to place; drag to move; R to rotate',stage:'Click to place staging; R to set driving direction',start:'Click to place the timing start',finish:'Click to place finish',select:'Select an object to move it',pan:'Drag to pan'} as Record<string,string>)[t];canvas.style.cursor=t==='pan'?'grab':t==='select'?'default':'crosshair';}
function sync(){
 $('.compass').style.transform=`rotate(${layout.viewAngle??0}deg)`;
 $<HTMLInputElement>('#course-name').value=layout.name;$<HTMLInputElement>('#columns').value=String(layout.columns);$<HTMLInputElement>('#rows').value=String(layout.rows);
 $('#site-size').textContent=`${layout.columns*25} × ${layout.rows*25} ft`;
 $('#cone-count').textContent=String(layout.items.filter(i=>i.kind==='cone'||i.kind==='pointer').length);
 $('#gates').innerHTML=['stage','start','finish'].map(k=>`<div class="gate-status"><span class="gate-dot ${k}"></span><span>${k==='stage'?'Stage':k==='start'?'Start':'Finish'}</span><small>${layout.items.some(i=>i.kind===k)?'✓':'not set'}</small></div>`).join('');
 $<HTMLButtonElement>('#undo').disabled=!history.length;$<HTMLButtonElement>('#redo').disabled=!future.length;
 const item=layout.items.find(i=>i.id===selected);
 $('#inspector').hidden=!item;
 $('#properties').innerHTML=item?`<h2 class="selected-title">${item.kind==='pointer'?'Pointer cone':item.kind==='cone'?'Traffic cone':item.kind==='stage'?'Staging point':item.kind==='start'?'Start line':'Finish line'}</h2><div class="two-fields"><label>X (ft)<input id="item-x" type="number" min="0" max="${layout.columns*25}" step="0.1" value="${(item.x/FOOT).toFixed(1)}"></label><label>Y (ft)<input id="item-z" type="number" min="0" max="${layout.rows*25}" step="0.1" value="${(item.z/FOOT).toFixed(1)}"></label></div><label class="setting">Heading (°)<input id="item-angle" type="number" step="15" value="${item.angle}"></label><div class="object-actions"><button id="rotate">Rotate 15°</button><button id="delete" class="danger">Delete</button></div><p class="subtle">${item.kind==='stage'?'Car spawn; arrow points forward':item.kind==='pointer'?'18 in cone, resting on its side':item.kind==='cone'?'18 in tall; 11 in base (assumed)':`${((item.width??6.096)/FOOT).toFixed(1)} ft gate; arrow points forward`}</p>`:'';
 if(item){for(const axis of ['x','z','angle'] as const){$<HTMLInputElement>('#item-'+axis).onchange=e=>{const n=Number((e.target as HTMLInputElement).value);if(!Number.isFinite(n)){sync();return;}remember();item[axis]=axis==='angle'?((n%360)+360)%360:Math.max(0,Math.min(n*FOOT,(axis==='x'?layout.columns:layout.rows)*PAD));change();};}$('#rotate').onclick=rotate;$('#delete').onclick=remove;}
}
const viewAngle=()=>(layout.viewAngle??0)*Math.PI/180;
function fit(){autoFit=true;({scale,ox,oy}=fitView(width,height,layout.columns*PAD,layout.rows*PAD,viewAngle()));draw();}
function draw(){
 ctx.clearRect(0,0,width,height);ctx.fillStyle='#edf0f2';ctx.fillRect(0,0,width,height);ctx.save();ctx.translate(ox,oy);ctx.rotate(viewAngle());ctx.scale(scale,scale);
 const w=layout.columns*PAD,h=layout.rows*PAD;ctx.fillStyle='#d9dcdd';ctx.fillRect(0,0,w,h);
 for(let y=0;y<layout.rows;y++)for(let x=0;x<layout.columns;x++){const c=213+((x*7+y*3)%5)*2;ctx.fillStyle=`rgb(${c},${c+2},${c+3})`;ctx.fillRect(x*PAD,y*PAD,PAD,PAD);}
 if(grid){ctx.lineWidth=1/scale;ctx.strokeStyle='#bac1c5';ctx.beginPath();for(let x=0;x<=layout.columns;x++){ctx.moveTo(x*PAD,0);ctx.lineTo(x*PAD,h);}for(let y=0;y<=layout.rows;y++){ctx.moveTo(0,y*PAD);ctx.lineTo(w,y*PAD);}ctx.stroke();}
 ctx.strokeStyle='#929da5';ctx.lineWidth=1.5/scale;ctx.strokeRect(0,0,w,h);
 ctx.fillStyle='#66727d';ctx.font=`${10/scale}px monospace`;ctx.textAlign='center';for(let x=0;x<layout.columns;x+=Math.max(1,Math.ceil(30/(PAD*scale))))ctx.fillText(String(x+1).padStart(2,'0'),(x+.5)*PAD,-9/scale);
 for(const i of layout.items){ctx.save();ctx.translate(i.x,i.z);ctx.rotate(i.angle*Math.PI/180);
 if(i.kind==='cone'){
 const orange=`rgb(${coneColor(i.id).join(',')})`;
 // Accurate footprint, with a screen-space locator ring for legibility at site scale.
 ctx.fillStyle=orange;ctx.fillRect(-CONE_BASE/2,-CONE_BASE/2,CONE_BASE,CONE_BASE);ctx.fillStyle=orange;ctx.beginPath();ctx.arc(0,0,.115,0,Math.PI*2);ctx.fill();
 if(scale<22){ctx.strokeStyle='#d7672c';ctx.lineWidth=1.5/scale;ctx.beginPath();ctx.arc(0,0,3/scale,0,Math.PI*2);ctx.stroke();}
 }else if(i.kind==='pointer'){
 const length=(CONE_HEIGHT-.02)*Math.cos(POINTER_TILT);
 const half=CONE_BASE/2;
 // Draw the real footprint, with a larger direction locator at site scale.
 ctx.fillStyle=`rgb(${coneColor(i.id).join(',')})`;ctx.fillRect(-half,-.02,CONE_BASE,.04);
 ctx.beginPath();ctx.moveTo(-.115,0);ctx.lineTo(-.018,-length);ctx.lineTo(.018,-length);ctx.lineTo(.115,0);ctx.closePath();ctx.fill();
 if(scale<28){ctx.strokeStyle='#c7581c';ctx.lineWidth=1.8/scale;ctx.beginPath();ctx.moveTo(-4/scale,3/scale);ctx.lineTo(0,-7/scale);ctx.lineTo(4/scale,3/scale);ctx.closePath();ctx.stroke();}
 }else if(i.kind==='stage'){
 ctx.strokeStyle='#245dc1';ctx.fillStyle='#245dc122';ctx.lineWidth=1.5/scale;
 const rw=Math.max(1,7/scale),rh=Math.max(2,11/scale);
 ctx.fillRect(-rw,-rh,rw*2,rh*2);ctx.strokeRect(-rw,-rh,rw*2,rh*2);
 ctx.fillStyle='#245dc1';ctx.beginPath();ctx.moveTo(0,-rh-6/scale);ctx.lineTo(-4/scale,-rh+1/scale);ctx.lineTo(4/scale,-rh+1/scale);ctx.closePath();ctx.fill();
 ctx.rotate(-i.angle*Math.PI/180-viewAngle());ctx.font=`bold ${10/scale}px sans-serif`;ctx.textAlign='center';ctx.fillText('STAGE',0,24/scale);
 }else{const color=i.kind==='start'?'#39715b':'#b4743f';ctx.strokeStyle=color;ctx.lineWidth=3/scale;ctx.beginPath();ctx.moveTo(-(i.width??6.096)/2,0);ctx.lineTo((i.width??6.096)/2,0);ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-12/scale);ctx.lineTo(-4/scale,-5/scale);ctx.lineTo(4/scale,-5/scale);ctx.closePath();ctx.fill();ctx.font=`bold ${10/scale}px sans-serif`;ctx.textAlign='center';ctx.save();ctx.rotate(-i.angle*Math.PI/180-viewAngle());ctx.fillText(i.kind.toUpperCase(),0,20/scale);ctx.restore();}
 if(i.id===selected){ctx.strokeStyle='#245dc1';ctx.lineWidth=1.5/scale;ctx.setLineDash([3/scale,3/scale]);ctx.strokeRect(-9/scale,-9/scale,18/scale,18/scale);}ctx.restore();}
 ctx.restore();$('#zoom-level').textContent=`${Math.round(scale/5*100)}%`;
 const bar=Math.min(25*FOOT*scale,150);ctx.strokeStyle='#66727d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(22,height-70);ctx.lineTo(22+bar,height-70);ctx.stroke();ctx.font='10px monospace';ctx.textAlign='left';ctx.fillStyle='#66727d';ctx.fillText(`${(bar/scale/FOOT).toFixed(0)} ft`,22,height-78);
}
new ResizeObserver(()=>{const r=canvas.parentElement!.getBoundingClientRect();const first=!width;width=r.width;height=r.height;canvas.width=width*devicePixelRatio;canvas.height=height*devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);if(first||autoFit)fit();else draw();}).observe(canvas.parentElement!);
const pos=(e:PointerEvent|WheelEvent)=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
const world=(p:{x:number,y:number})=>{const r=rotatePoint({x:(p.x-ox)/scale,y:(p.y-oy)/scale},-viewAngle());return {x:r.x,z:r.y};};
const bounded=(p:{x:number,z:number})=>({x:Math.max(0,Math.min(layout.columns*PAD,snap(p.x,snapStep))),z:Math.max(0,Math.min(layout.rows*PAD,snap(p.z,snapStep)))});
const hitTest=(w:{x:number;z:number})=>[...layout.items].reverse().find(i=>Math.hypot(i.x-w.x,i.z-w.z)<Math.max(10/scale,i.kind==='cone'?.2:i.kind==='pointer'?.5:i.kind==='stage'?2:(i.width??6.096)/2));
let space=false,drag:null|{x:number;y:number;ox:number;oy:number;item?:Item;changed:boolean;offsetX:number;offsetZ:number}=null;
canvas.onpointerdown=e=>{const p=pos(e),w=world(p);canvas.setPointerCapture(e.pointerId);if(tool==='pan'||space||e.button===1){drag={...p,ox,oy,changed:false,offsetX:0,offsetZ:0};return;}if(e.button!==0)return;
 const hit=hitTest(w);
 if(hit||tool==='select'){selected=hit?.id??null;if(hit){drag={...p,ox,oy,item:hit,changed:false,offsetX:hit.x-w.x,offsetZ:hit.z-w.z};canvas.style.cursor='grabbing';}sync();draw();return;}
 if(w.x<0||w.z<0||w.x>layout.columns*PAD||w.z>layout.rows*PAD)return;
 remember();if(tool==='stage'||tool==='start'||tool==='finish')layout.items=layout.items.filter(i=>i.kind!==tool);const item:Item={id:crypto.randomUUID(),kind:tool as Item['kind'],...bounded(w),angle:0};layout.items.push(item);selected=item.id;change();};
canvas.onpointermove=e=>{const p=pos(e),w=world(p);$('#coordinates').textContent=`X ${(w.x/FOOT).toFixed(1)} ft   Y ${(w.z/FOOT).toFixed(1)} ft`;if(!drag){canvas.style.cursor=tool==='pan'||space?'grab':hitTest(w)?'grab':tool==='select'?'default':'crosshair';return;}if(drag.item){if(!drag.changed && Math.hypot(p.x-drag.x,p.y-drag.y)<3)return;if(!drag.changed){remember();drag.changed=true;}Object.assign(drag.item,bounded({x:w.x+drag.offsetX,z:w.z+drag.offsetZ}));}else{autoFit=false;ox=drag.ox+p.x-drag.x;oy=drag.oy+p.y-drag.y;}draw();};
canvas.onpointerup=canvas.onpointercancel=()=>{if(drag?.changed)change();drag=null;canvas.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';};
function zoom(factor:number,p={x:width/2,y:height/2}){autoFit=false;const w=world(p);scale=Math.max(.5,Math.min(100,scale*factor));const projected=rotatePoint({x:w.x,y:w.z},viewAngle());ox=p.x-projected.x*scale;oy=p.y-projected.y*scale;draw();}
canvas.onwheel=e=>{e.preventDefault();zoom(Math.exp(-e.deltaY*.001),pos(e));};
function rotate(){const i=layout.items.find(i=>i.id===selected);if(i){remember();i.angle=(i.angle+15)%360;change();}}
function remove(){if(selected){remember();layout.items=layout.items.filter(i=>i.id!==selected);selected=null;change();}}
function undo(redo=false){const from=redo?future:history,to=redo?history:future;const s=from.pop();if(s){to.push(JSON.stringify(layout));layout=JSON.parse(s);selected=null;change();if(autoFit)fit();}}
window.onkeydown=e=>{if((e.target as HTMLElement).matches('input,select,textarea')||document.querySelector('dialog[open]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);return;}if(e.code==='Space'){e.preventDefault();space=true;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();remove();}if(e.key.toLowerCase()==='r')rotate();const t=({v:'select',c:'cone',p:'pointer',g:'stage',s:'start',f:'finish',h:'pan'} as Record<string,string>)[e.key.toLowerCase()];if(t)setTool(t);};window.onkeyup=e=>{if(e.code==='Space')space=false;};window.onblur=()=>{space=false;drag=null;};
document.querySelectorAll<HTMLElement>('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool!));
$('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);$('#fit').onclick=fit;$('#undo').onclick=()=>undo();$('#redo').onclick=()=>undo(true);
$<HTMLInputElement>('#course-name').onchange=e=>{remember();layout.name=(e.target as HTMLInputElement).value.trim()||'Untitled course';change();};
for(const axis of ['columns','rows'] as const)$<HTMLInputElement>('#'+axis).onchange=e=>{const n=Number((e.target as HTMLInputElement).value);if(!Number.isInteger(n)||n<4||n>80){toast('Use a whole number between 4 and 80 pads.');sync();return;}if(layout.items.some(i=>(axis==='columns'?i.x:i.z)>n*PAD)){toast('Move objects inside the smaller site before resizing.');sync();return;}remember();layout[axis]=n;change();fit();};
$<HTMLSelectElement>('#snap').onchange=e=>snapStep=Number((e.target as HTMLSelectElement).value)*FOOT;
$<HTMLInputElement>('#grid').onchange=e=>{grid=(e.target as HTMLInputElement).checked;draw();};
$('#help').onclick=()=>$<HTMLDialogElement>('#help-dialog').showModal();
$('#close-help').onclick=()=>$<HTMLDialogElement>('#help-dialog').close();
$('#save').onclick=()=>download(JSON.stringify(layout,null,2),'course.padwork.json','application/json');
$('#open').onclick=()=>$<HTMLInputElement>('#file').click();$<HTMLInputElement>('#file').onchange=async e=>{const input=e.target as HTMLInputElement;try{const file=input.files?.[0];if(!file)return;if(file.size>5e6)throw Error('Layout file is too large.');const loaded=validateLayout(JSON.parse(await file.text()));remember();layout=loaded;selected=null;change();fit();toast('Layout opened.');}catch(err){toast(err instanceof Error?err.message:'Could not open layout.');}input.value='';};
$('#demo').onclick=()=>{remember();layout=demoLayout();selected=null;change();fit();toast('Example loaded. Undo restores your previous course.');};$('#new').onclick=()=>{remember();layout=emptyLayout();selected=null;change();fit();};
$('#export').onclick=()=>{if(['stage','start','finish'].some(k=>!layout.items.some(i=>i.kind===k))){toast('Place staging, start, and finish before exporting.');return;}$<HTMLDialogElement>('#export-dialog').showModal();};$('#close-export').onclick=()=>$<HTMLDialogElement>('#export-dialog').close();$('#download-package').onclick=()=>{try{const {slug,zip}=buildExport(layout);download(new Uint8Array(zip).buffer,slug+'-source.zip');toast('Source package downloaded.');}catch(e){toast((e as Error).message);}};
$('#drive').onclick=async ()=>{
 const button=$<HTMLButtonElement>('#drive');button.disabled=true;
 try{const {openDrivingTester}=await import('./drive-tester');openDrivingTester(layout);}
 catch(error){toast(error instanceof Error?error.message:'Could not start the driving tester.');}
 finally{button.disabled=false;}
};
let cleanupPreview=()=>{};
$('#preview').onclick=async ()=>{
 const dialog=$<HTMLDialogElement>('#preview-dialog');dialog.showModal();const host=$('#three');
 try{const [THREE,{OrbitControls}]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js')]);if(!dialog.open)return;const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(host.clientWidth,host.clientHeight);host.append(renderer.domElement);
 const {createCourseScene,disposeScene}=await import('./course-scene');if(!dialog.open){renderer.dispose();host.replaceChildren();return;}
 const scene=createCourseScene(layout);const camera=new THREE.PerspectiveCamera(45,host.clientWidth/host.clientHeight,.05,5000);const w=layout.columns*PAD,h=layout.rows*PAD;camera.position.set(w*.55,Math.max(w,h)*.65,h*1.15);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(w/2,0,h/2);const focus=layout.items.find(i=>i.id===selected&&(i.kind==='cone'||i.kind==='pointer'));if(focus){controls.target.set(focus.x,.2,focus.z);camera.position.set(focus.x+.9,.8,focus.z+1.1);}controls.update();
 let frame=0;const render=()=>{frame=requestAnimationFrame(render);controls.update();renderer.render(scene,camera);};render();const resize=new ResizeObserver(()=>{if(!host.clientWidth)return;camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);});resize.observe(host);
 cleanupPreview=()=>{cancelAnimationFrame(frame);resize.disconnect();controls.dispose();disposeScene(scene);renderer.dispose();host.replaceChildren();};
 }catch{host.textContent='3D preview requires a browser with WebGL enabled.';cleanupPreview=()=>host.replaceChildren();}
};$('#close-preview').onclick=()=>$<HTMLDialogElement>('#preview-dialog').close();$<HTMLDialogElement>('#preview-dialog').onclose=()=>cleanupPreview();
sync();setTool(tool);
