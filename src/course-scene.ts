import * as THREE from 'three';
import {coneTexture} from './cone-material';
import {PAD,CONE_BASE,CONE_HEIGHT,POINTER_TILT,POINTER_CENTER_HEIGHT,type Layout} from './model';
export function createCourseScene(layout:Layout){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#dfe5de');const w=layout.columns*PAD,h=layout.rows*PAD;
 scene.add(new THREE.HemisphereLight(0xffffff,0x606b50,2.6));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-30,80,20);scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({color:0xc2c6bc,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(w/2,0,h/2);scene.add(ground);
 const points=[];for(let c=0;c<=layout.columns;c++)points.push(c*PAD,.005,0,c*PAD,.005,h);for(let r=0;r<=layout.rows;r++)points.push(0,.005,r*PAD,w,.005,r*PAD);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x9fa899})));
 const baseGeo=new THREE.BoxGeometry(CONE_BASE,.04,CONE_BASE);
 const bodyGeo=new THREE.CylinderGeometry(.018,.115,CONE_HEIGHT-.04,32);
 for(const item of layout.items){if(item.kind==='cone'||item.kind==='pointer'){
 const appearance=coneTexture(item.id);
 const texture=new THREE.DataTexture(appearance.pixels,appearance.width,appearance.height,THREE.RGBAFormat);
 texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
 const material=new THREE.MeshStandardMaterial({map:texture,roughness:.78,metalness:0});
 const group=new THREE.Group();const base=new THREE.Mesh(baseGeo,material);group.add(base);
 const body=new THREE.Mesh(bodyGeo,material);body.position.y=CONE_HEIGHT/2;group.add(body);
 group.position.set(item.x,item.kind==='pointer'?POINTER_CENTER_HEIGHT:.02,item.z);
 group.rotation.set(item.kind==='pointer'?-Math.PI/2-POINTER_TILT:0,-item.angle*Math.PI/180,0,'YXZ');scene.add(group);
 }else if(item.kind==='stage'){
 const group=new THREE.Group();const outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.8,.04,4)),new THREE.LineBasicMaterial({color:0x245dc1}));
 group.add(outline);group.position.set(item.x,.04,item.z);group.rotation.y=-item.angle*Math.PI/180;scene.add(group);
 const a=item.angle*Math.PI/180;scene.add(new THREE.ArrowHelper(new THREE.Vector3(Math.sin(a),0,-Math.cos(a)),new THREE.Vector3(item.x,.1,item.z),3,0x245dc1));
 }else{const gate=new THREE.Mesh(new THREE.BoxGeometry(item.width??6.096,.015,.16),new THREE.MeshStandardMaterial({color:item.kind==='start'?0x398660:0xdd9955}));gate.position.set(item.x,.015,item.z);gate.rotation.y=-item.angle*Math.PI/180;scene.add(gate);const a=item.angle*Math.PI/180;scene.add(new THREE.ArrowHelper(new THREE.Vector3(Math.sin(a),0,-Math.cos(a)),new THREE.Vector3(item.x,.08,item.z),3,item.kind==='start'?0x398660:0xdd9955));}}

 return scene;
}
export function disposeScene(scene:THREE.Scene){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
 scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m instanceof THREE.MeshStandardMaterial&&m.map)textures.add(m.map);}}});
 for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();scene.clear();
}
