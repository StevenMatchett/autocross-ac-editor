import {prepareVenue,loadVenueScene,groundHeight} from './venue';
import * as THREE from 'three';
import {natsCone,natsTextureURL,coneTint} from './nats-assets';
import {PAD,type Layout} from './model';
export async function createCourseScene(layout:Layout){
 let venueScene:THREE.Group|undefined;
 if(layout.venue){await prepareVenue();venueScene=await loadVenueScene();}
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dfe5de');const w=layout.columns*PAD,h=layout.rows*PAD;
 scene.add(new THREE.HemisphereLight(0xffffff,0x606b50,2.6));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-30,80,20);scene.add(sun);
 if(venueScene)scene.add(venueScene);
 else {
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:0xc2c6bc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(w/2,0,h/2);scene.add(ground);
 const points=[];for(let c=0;c<=layout.columns;c++)points.push(c*PAD,.005,0,c*PAD,.005,h);for(let r=0;r<=layout.rows;r++)points.push(0,.005,r*PAD,w,.005,r*PAD);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x9fa899})));
 }
 const geometries=Object.fromEntries((['cone','pointer'] as const).map(kind=>{
  const asset=natsCone[kind],geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(asset.positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(asset.normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(asset.uv,2));geometry.setIndex(asset.indices);
  return [kind,geometry];
 }));
 const texture=new THREE.TextureLoader().load(natsTextureURL);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;
 for(const item of layout.items){if(item.kind==='cone'||item.kind==='pointer'){
 const tint=coneTint(item.id);
 const material=new THREE.MeshStandardMaterial({map:texture,color:new THREE.Color(tint,tint,tint),roughness:.78,metalness:0});
 const mesh=new THREE.Mesh(geometries[item.kind],material);
 mesh.position.set(item.x,groundHeight(layout,item.x,item.z),item.z);mesh.rotation.y=-item.angle*Math.PI/180;scene.add(mesh);
 }else if(item.kind==='stage'){
 const group=new THREE.Group();const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8,.04,4)),new THREE.LineBasicMaterial({color:0x245dc1}));
 group.add(outline);group.position.set(item.x,groundHeight(layout,item.x,item.z)+.04,item.z);group.rotation.y=-item.angle*Math.PI/180;scene.add(group);
 const a=item.angle*Math.PI/180;scene.add(new THREE.ArrowHelper(new THREE.Vector3(Math.sin(a),0,-Math.cos(a)),new THREE.Vector3(item.x,groundHeight(layout,item.x,item.z)+.1,item.z),3,0x245dc1));
 }else{const gate=new THREE.Mesh(new THREE.BoxGeometry(item.width??6.096,.015,.16),new THREE.MeshStandardMaterial({color:item.kind==='start'?0x398660:0xdd9955}));gate.position.set(item.x,groundHeight(layout,item.x,item.z)+.015,item.z);gate.rotation.y=-item.angle*Math.PI/180;scene.add(gate);const a=item.angle*Math.PI/180;scene.add(new THREE.ArrowHelper(new THREE.Vector3(Math.sin(a),0,-Math.cos(a)),new THREE.Vector3(item.x,groundHeight(layout,item.x,item.z)+.08,item.z),3,item.kind==='start'?0x398660:0xdd9955));}}

 return scene;
}
export function disposeScene(scene:THREE.Scene){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if((m instanceof THREE.MeshStandardMaterial||m instanceof THREE.MeshBasicMaterial)&&m.map)textures.add(m.map);}}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures){t.dispose();if(typeof ImageBitmap!=='undefined'&&t.image instanceof ImageBitmap)t.image.close();}scene.clear();
}
