import buildTools from './assets/track-build.json';
import type {RoadSurface} from './road-surface';
import {getRoad} from './venue';
import {natsCone,natsTexturePNG,coneTint,assetAttribution} from './nats-assets';
import { zipSync, strToU8 } from 'fflate';
import { type Layout } from './model';
export function download(data:BlobPart,name:string,type='application/octet-stream'){
 const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function buildExport(layout:Layout,venueGLB?:Uint8Array,road:RoadSurface|undefined=getRoad()){
 if(layout.venue&&!venueGLB)throw Error('Load the venue model before exporting.');
 const elevations:Record<string,number>={};
 for(const item of layout.items){
  const y=layout.venue?road?.height(item.x,item.z):0;
  if(y==null)throw Error('Move all course objects onto the Lincoln driving surface before exporting.');
  elevations[item.id]=y;
 }
 if(['stage','start','finish'].some(k=>!layout.items.some(i=>i.kind===k))) throw Error('Place staging, start, and finish before exporting.');
 const slug=(layout.name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,32)) || 'autocross';
 const script=buildTools['build_track.py'];
 const readme=`PADWORK — ${layout.name}

Extract this whole source archive. Install Blender 4.5 or newer (5.2.2 verified).
Windows: .\\Build-Track.ps1 "C:\\path\\to\\export"
Install: .\\Build-Track.ps1 "C:\\path\\to\\export" -Install
Overrides: -BlenderPath "C:\\path\\to\\blender.exe" -ACPath "D:\\SteamLibrary\\steamapps\\common\\assettocorsa"
The command builds ${slug}.kn5, validates it, and produces ${slug}-install.zip.
Installation refuses to overwrite an existing track. The ZIP contains content/tracks/${slug}/.
Manual: blender --background --python-exit-code 1 --python build_track.py
Optional ksEditor fallback FBX: append -- --fbx. The script clears the Blender scene.

The Python build tools include their source, upstream pin and GPL-3.0 license.
All diffuse maps are embedded with exact matching material references. Cone brightness
is preserved. Venue transparency uses automatic alpha testing/blending; inspect it in-game.
The generated preview is an overhead course diagram. AI lines are not included.
Keep 1WALL_cone_* and 1WALL_pointer_* mesh names intact: these enable fixed collisions.
Preserve 1PROAD and 1GRASS surface names. WALL is explicitly defined in surfaces.ini.
Visible cone_* and pointer_* meshes retain their original geometry. Separate nonrenderable
1WALL_* boxes follow each footprint/heading and reach 1.2 m above pavement for bumper contact.
Set every 1WALL_cone_* and 1WALL_pointer_* mesh to non-renderable in ksEditor if using the FBX fallback.
Direct KN5 export sets this automatically. Cones are fixed, not movable props; no penalties.

Compiled/validated does not mean tested in-game. First run in Practice:
1. Confirm pit/hotlap position, elevation, up axis and direction at staging.
2. Cross the start in the intended direction and finish; confirm timing starts/stops.
3. Hit both upright and pointer cones slowly, then at normal course speed; check collision.
4. Inspect pavement, texture coverage, transparent scenery and course alignment.

Reference: a previous 2026 Nationals — East build was installed and confirmed working by
its user. Timing and cone collisions were not separately confirmed. Every new build
requires this Practice checklist. See ASSET_CREDITS.txt for asset permissions.
Geometry: ${layout.venue?'original Lincoln venue at native scale/elevation':'25 x 25-foot concrete pads'}.
Cone height 18 inches (0.4572 m); base approximately 0.2914 m square.
Units in layout.json are meters. Heading 0 = north, 90 = east.
Pit/hotlap use staging; A-to-B gates use start/finish. Timing gate width defaults to 20 feet.
`;
 const files:Record<string,Uint8Array>={
 ...Object.fromEntries(Object.entries(buildTools).map(([name,content])=>[name,strToU8(content)])),
 'build.json':strToU8(JSON.stringify({slug})),
 'layout.json':strToU8(JSON.stringify(layout,null,2)), 'build_track.py':strToU8(script),'README.txt':strToU8(readme),
 [`${slug}/models.ini`]:strToU8(`[MODEL_0]\nFILE=${slug}.kn5\nPOSITION=0,0,0\nROTATION=0,0,0\n`),
 [`${slug}/ui/ui_track.json`]:strToU8(JSON.stringify({name:layout.name,description:'Flat concrete autocross practice course',tags:['autocross'],country:'USA',city:'Custom pad site',pitboxes:'1',run:'point-to-point',author:'Padwork',version:'0.1'},null,2)),
 [`${slug}/data/surfaces.ini`]:strToU8('[SURFACE_0]\nKEY=ROAD\nFRICTION=1\nDAMPING=0\nWAV=\nWAV_PITCH=0\nFF_EFFECT=NULL\nDIRT_ADDITIVE=0\nBLACK_FLAG_TIME=0\nIS_VALID_TRACK=1\nSIN_HEIGHT=0\nSIN_LENGTH=0\nIS_PITLANE=0\nVIBRATION_GAIN=0\nVIBRATION_LENGTH=0\n')};
 files['cone-assets.json']=strToU8(JSON.stringify({cone:natsCone.cone,pointer:natsCone.pointer,tints:Object.fromEntries(layout.items.map((item,index)=>[index,coneTint(item.id)]))}));
 files['texture/ConePaintTexture.png']=natsTexturePNG();
 files['ASSET_CREDITS.txt']=strToU8(assetAttribution+(layout.venue?'\nVenue geometry/textures: nats-mod, same source and permission. Converted to glTF with resized textures and simplified materials.\n':''));
 files[`${slug}/ASSET_CREDITS.txt`]=files['ASSET_CREDITS.txt'];
 files['elevations.json']=strToU8(JSON.stringify(elevations));
 if(layout.venue&&venueGLB){
  files['lincoln.glb']=venueGLB;
  files[`${slug}/data/surfaces.ini`]=strToU8('[SURFACE_0]\nKEY=PROAD\nFRICTION=1\nDAMPING=0\nIS_VALID_TRACK=1\nIS_PITLANE=0\nBLACK_FLAG_TIME=0\n[SURFACE_1]\nKEY=GRASS\nFRICTION=1.05\nDAMPING=0\nIS_VALID_TRACK=1\nIS_PITLANE=0\nBLACK_FLAG_TIME=0\n');
  files['README.txt']=strToU8(readme+'\nLINCOLN VENUE: lincoln.glb replaces generated pads. Original venue positions are translated by +22.86 m X, +518.16 m Z into editor coordinates; geometry retains its elevations. Textures are resized and materials approximated for portability. Preserve 1PROAD and 1GRASS names and verify compiled shaders in-game. Grid overlay is a measuring aid, not surveyed joint alignment.\n');
 }
 files[`${slug}/data/surfaces.ini`]=strToU8(new TextDecoder().decode(files[`${slug}/data/surfaces.ini`])+`[SURFACE_${layout.venue?2:1}]\nKEY=WALL\nFRICTION=0.8\nDAMPING=0\nIS_VALID_TRACK=0\nIS_PITLANE=0\nBLACK_FLAG_TIME=0\n`);
 return {slug,files,zip:zipSync(files)};
}
