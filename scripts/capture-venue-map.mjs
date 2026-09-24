import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:2016,height:1776},deviceScaleFactor:1});
 page.on('pageerror',error=>console.error(error));
 await page.goto('http://localhost:5173');
 await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {loadVenueScene,prepareVenue}=await import('/src/venue.ts');
  const model=await loadVenueScene();await prepareVenue();
  model.traverse(o=>{if(o.isMesh){const m=o.material;o.material=new THREE.MeshBasicMaterial({map:m.map,side:m.side,alphaTest:m.alphaTest});}});
  const scene=new THREE.Scene();scene.background=new THREE.Color('#a0a88b');scene.add(model);
  const w=84*7.62,h=74*7.62;
  const camera=new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,.1,3000);camera.position.set(w/2,1000,h/2);camera.up.set(0,0,-1);camera.lookAt(w/2,0,h/2);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);document.body.style.margin='0';Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'999'});document.body.append(renderer.domElement);renderer.render(scene,camera);
 });
 await page.screenshot({path:'public/venue/map.jpg',type:'jpeg',quality:90});
 console.log('Captured exact venue overhead map.');
}finally{await browser.close();}
