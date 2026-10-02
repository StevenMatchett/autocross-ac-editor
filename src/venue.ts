import {gunzipSync} from 'fflate';
import metadata from './assets/venue.json';
import {RoadSurface} from './road-surface';
import type {Layout} from './model';
export const VENUE=metadata;
export const venueLayout=():Layout=>({version:1,name:'Lincoln Nationals',venue:'lincoln',columns:VENUE.columns,rows:VENUE.rows,items:[{id:'lincoln-stage',kind:'stage',x:480,z:480,angle:0}]});
let road:RoadSurface|undefined,roadRequest:Promise<RoadSurface>|undefined,modelRequest:Promise<Uint8Array>|undefined;
export const venueURL=(file:string)=>`${import.meta.env.BASE_URL}venue/${file}`;
async function compressed(file:string){
 const response=await fetch(venueURL(file));if(!response.ok)throw Error(`Could not load Lincoln venue (${response.status}). Try again.`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 // Some static servers advertise Content-Encoding and the browser decodes it.
 return bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):bytes;
}
export function prepareVenue(){return roadRequest??=(compressed('road.bin.gz').then(bytes=>road=new RoadSurface(bytes)).catch(error=>{roadRequest=undefined;throw error;}));}
export function venueModel(){return modelRequest??=(compressed('lincoln.glb.gz').catch(error=>{modelRequest=undefined;throw error;}));}
export function getRoad(){return road;}
export function groundHeight(layout:Layout,x:number,z:number){return layout.venue?(road?.height(x,z)??0):0;}
export async function loadVenueScene(){
 const [{GLTFLoader},THREE,bytes]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three'),venueModel()]);
 const result=await new GLTFLoader().parseAsync(bytes.slice().buffer,'');
 const loader=new THREE.TextureLoader();
 const [detail,mask]=await Promise.all([
  loader.loadAsync(new URL('../scripts/assets/2026-east-pavement.jpg',import.meta.url).href),
  loader.loadAsync(new URL('./assets/pavement-mask.svg',import.meta.url).href),
 ]);
 detail.wrapS=detail.wrapT=THREE.RepeatWrapping;detail.colorSpace=THREE.NoColorSpace;detail.anisotropy=8;
 // glTF images use top-origin UVs; TextureLoader defaults to the opposite flip.
 mask.flipY=false;mask.wrapS=mask.wrapT=THREE.RepeatWrapping;mask.colorSpace=THREE.NoColorSpace;
 result.scene.traverse(object=>{const mesh=object as import('three').Mesh;if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
  const road=material as import('three').MeshStandardMaterial;
  if(road.map)road.map.anisotropy=8;
  if(road.name!=='RoadBackground')continue;
  road.userData.extraTextures=[detail,mask];
  road.onBeforeCompile=shader=>{
   shader.uniforms.pavementDetail={value:detail};shader.uniforms.pavementMask={value:mask};
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nvarying vec2 vPavementWorld;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvPavementWorld=(modelMatrix*vec4(transformed,1.0)).xz;');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>','#include <common>\nuniform sampler2D pavementDetail;\nuniform sampler2D pavementMask;\nvarying vec2 vPavementWorld;')
    .replace('#include <map_fragment>',`#include <map_fragment>
      float pavementCoverage=texture2D(pavementMask,vMapUv).r;
      float pavementGrain=texture2D(pavementDetail,vPavementWorld/4.0).r;
      vec2 slab=abs(fract((vPavementWorld+vec2(1.4,3.1))/7.62)-0.5);
      float joint=max(smoothstep(0.489,0.499,slab.x),smoothstep(0.489,0.499,slab.y));
      float nearDetail=1.0-smoothstep(60.0,220.0,distance(vPavementWorld,cameraPosition.xz));
      float finish=1.0+nearDetail*((pavementGrain-0.53)*0.9-joint*(0.16+pavementGrain*0.10));
      diffuseColor.rgb*=mix(1.0,finish,pavementCoverage);`);
  };
  road.customProgramCacheKey=()=> 'pavement-detail-v1';road.needsUpdate=true;
 }});
 result.scene.name='Lincoln venue';return result.scene;
}
