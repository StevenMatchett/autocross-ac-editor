import type {RoadSurface} from './road-surface';
import {getRoad} from './venue';
import {natsCone,natsTexturePNG,coneTint,assetAttribution} from './nats-assets';
import { zipSync, strToU8 } from 'fflate';
import { type Layout, CONE_HEIGHT, CONE_BASE, PAD } from './model';
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
 const script=`# Run: blender --background --python build_track.py
# Creates a NEW scene. Run in a fresh Blender session.
import bpy, json, math
from pathlib import Path
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parent
layout = json.loads((ROOT / 'layout.json').read_text())
cone_assets = json.loads((ROOT / 'cone-assets.json').read_text())
elevations = json.loads((ROOT / 'elevations.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0
PAD = ${PAD}
HEIGHT = ${CONE_HEIGHT}
BASE = ${CONE_BASE}
width, depth = layout['columns']*PAD, layout['rows']*PAD
def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    return m
concrete = [material('Concrete_'+str(i), (0.48+i*0.012, 0.49+i*0.012, 0.47+i*0.012)) for i in range(4)]
def cone_material(index):
    m = material('Cone_%04d'%index, (1, .22, .035))
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .78
    image = bpy.data.images.load(str(ROOT/'texture'/'ConePaintTexture.png'), check_existing=True)
    image.colorspace_settings.name = 'sRGB'
    texture = m.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    tint = cone_assets['tints'][str(index)]
    multiply = m.node_tree.nodes.new('ShaderNodeMixRGB')
    multiply.blend_type = 'MULTIPLY'; multiply.inputs[0].default_value = 1
    multiply.inputs[2].default_value = (tint,tint,tint,1)
    m.node_tree.links.new(texture.outputs['Color'], multiply.inputs[1])
    m.node_tree.links.new(multiply.outputs[0], shader.inputs['Base Color'])
    return m
def cube(name, location, dimensions, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o=bpy.context.object; o.name=name; o.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    return o
# Blender uses Z up. Editor x/z becomes Blender x/-y, then FBX Y up.
if layout.get('venue')=='lincoln':
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'lincoln.glb'))
    for index,image in enumerate(bpy.data.images):
        if image.type=='IMAGE' and image.has_data:
            image.filepath_raw=str(ROOT/'texture'/('venue_%03d.png'%index))
            image.file_format='PNG';image.save()
    # The converted model already shares the editor origin and real-world scale.
else:
    for row in range(layout['rows']):
        for col in range(layout['columns']):
            cube('1ROAD_pad_%d_%d'%(col,row), ((col+.5)*PAD,-(row+.5)*PAD,-.1), (PAD,PAD,.2), concrete[(col*7+row*3)%4])
            # Flush pads with thin visual seams above the continuous physical surface.
    seam = material('Pad_joints', (.23,.25,.23))
    for col in range(1,layout['columns']):
        cube('joint_x_'+str(col),(col*PAD,-depth/2,.001),(.018,depth,.002),seam)
    for row in range(1,layout['rows']):
        cube('joint_y_'+str(row),(width/2,-row*PAD,.001),(width,.018,.002),seam)
def marker(name,x,z,angle,elevation):
    o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o)
    o.location=(x,-z,elevation+1)
    a=math.radians(angle)
    # Local Y up, local Z forward; heading 0 is north in the editor.
    forward=Vector((math.sin(a),math.cos(a),0));up=Vector((0,0,1));right=up.cross(forward)
    o.rotation_euler=Matrix((right,up,forward)).transposed().to_euler()
for index,item in enumerate(layout['items']):
    x,z,a=item['x'],item['z'],item['angle']
    elevation=elevations[item['id']]
    if item['kind'] in ('cone', 'pointer'):
        orange = cone_material(index)
        asset=cone_assets[item['kind']]
        p=asset['positions'];uv=asset['uv'];indices=asset['indices']
        mesh=bpy.data.meshes.new('Nationals_cone')
        mesh.from_pydata([(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)], [], [indices[i:i+3] for i in range(0,len(indices),3)])
        mesh.update()
        uv_layer=mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            v=loop.vertex_index;uv_layer.data[loop.index].uv=(uv[v*2],uv[v*2+1])
        # Retain the original smooth cone normals and hard base edges.
        n=asset['normals']
        mesh.normals_split_custom_set_from_vertices([(n[i],-n[i+2],n[i+1]) for i in range(0,len(n),3)])
        for polygon in mesh.polygons: polygon.use_smooth=True
        obj=bpy.data.objects.new('1WALL_'+item['kind']+'_%04d'%index,mesh)
        bpy.context.collection.objects.link(obj);obj.location=(x,-z,elevation)
        obj.rotation_euler.z=-math.radians(a);mesh.materials.append(orange)
        # Original upright/pointer meshes are already grounded. WALL objects are fixed.
    elif item['kind']=='stage':
        marker('AC_PIT_0',x,z,a,elevation)
        marker('AC_HOTLAP_START_0',x,z,a,elevation)
    else:
        prefix='AC_AB_START' if item['kind']=='start' else 'AC_AB_FINISH'
        a_rad=math.radians(a)
        for side,sign in [('L',-1),('R',1)]:
            marker(prefix+'_'+side,x+sign*item.get('width',6.096)/2*math.cos(a_rad),z+sign*item.get('width',6.096)/2*math.sin(a_rad),a,elevation)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'${slug}.blend'))
bpy.ops.export_scene.fbx(filepath=str(ROOT/'${slug}.fbx'),use_selection=False,object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',global_scale=1.0,apply_unit_scale=True,bake_space_transform=False,add_leaf_bones=False,path_mode='COPY')
print('Created Blender scene and FBX. Compile to KN5 with ksEditor; see README.txt.')
`;
 const readme=`PADWORK — ${layout.name}

This is an Assetto Corsa SOURCE PACKAGE, not an installable track.

1. Extract this entire archive. Install Blender (4.x or newer).
2. In this folder run: blender --background --python build_track.py
   Or open build_track.py in Blender's Scripting workspace and Run Script
   in a fresh session (the script clears the current scene).
3. Open ${slug}.fbx in Assetto Corsa SDK ksEditor on Windows.
   Assign ksPerPixel materials and the included texture/ConePaintTexture.png diffuse maps.
   The PNG files contain the orange color and rubber marks; no procedural shader is required.
   Check scale (each pad 7.62 m), normals, and marker axes (Y up / Z forward).
4. Export ${slug}.kn5 into the included ${slug}/ folder.
5. Copy ${slug}/ to assettocorsa/content/tracks/ and test in practice mode.
   Confirm spawn direction, A-to-B timing, and impacts against upright and pointer cones in-game.
   Keep 1WALL_cone_* and 1WALL_pointer_* mesh names intact: these enable fixed collisions.

Geometry: ${layout.venue?'original Lincoln venue at its native scale':'exact 25 x 25 ft pads'}, cone height 18 in (0.4572 m).
Cones use the original Nationals mod geometry, UVs, and orange texture.
Cone base is approximately 0.2914 m square. See ASSET_CREDITS.txt. Units in layout.json are meters.
Heading 0 = north, 90 = east. Pointer tips follow that heading.
Pointer cones rest on their base edge and tip. Timing gates default to 20 feet unless width is specified in the layout.
${layout.venue?'The imported Lincoln pavement retains its original elevations.':'The pavement is flat and continuous; joints are visual strips.'}
Upright and pointer cones are fixed WALL collision meshes, not movable props.
Their collision geometry matches their visible size and orientation.
The intended behavior is a solid obstacle that blocks the car. Actual impact response,
including rebound or climbing over a low cone, depends on the game physics and car.
There is no scripted speed reset or cone penalty logic; verify stopping behavior in-game.
A-to-B start/finish markers are timing lines. Pit and hotlap spawns use the staging point and its heading. No AI line.
No KN5 compiler, AI, preview image or game installation is bundled.
This export has not been verified in Blender/ksEditor or Assetto Corsa.
${layout.venue?'The venue uses converted nats-mod geometry and textures.':'The overall site is a configurable pad rectangle, not a surveyed Lincoln replica.'}

Reference: https://assettocorsamods.net/threads/build-your-first-track-basic-guide.12/
`;
 const files:Record<string,Uint8Array>={
 'layout.json':strToU8(JSON.stringify(layout,null,2)), 'build_track.py':strToU8(script),'README.txt':strToU8(readme),
 [`${slug}/models.ini`]:strToU8(`[MODEL_0]\nFILE=${slug}.kn5\nPOSITION=0,0,0\nROTATION=0,0,0\n`),
 [`${slug}/ui/ui_track.json`]:strToU8(JSON.stringify({name:layout.name,description:'Flat concrete autocross practice course',tags:['autocross'],country:'USA',city:'Custom pad site',pitboxes:'1',run:'point-to-point',author:'Padwork',version:'0.1'},null,2)),
 [`${slug}/data/surfaces.ini`]:strToU8('[SURFACE_0]\nKEY=ROAD\nFRICTION=1\nDAMPING=0\nWAV=\nWAV_PITCH=0\nFF_EFFECT=NULL\nDIRT_ADDITIVE=0\nBLACK_FLAG_TIME=0\nIS_VALID_TRACK=1\nSIN_HEIGHT=0\nSIN_LENGTH=0\nIS_PITLANE=0\nVIBRATION_GAIN=0\nVIBRATION_LENGTH=0\n')};
 files['cone-assets.json']=strToU8(JSON.stringify({cone:natsCone.cone,pointer:natsCone.pointer,tints:Object.fromEntries(layout.items.map((item,index)=>[index,coneTint(item.id)]))}));
 files['texture/ConePaintTexture.png']=natsTexturePNG();
 files['ASSET_CREDITS.txt']=strToU8(assetAttribution+(layout.venue?'\nVenue geometry/textures: nats-mod, same source and permission. Converted to glTF with resized textures and simplified materials.\n':''));
 files['elevations.json']=strToU8(JSON.stringify(elevations));
 if(layout.venue&&venueGLB){
  files['lincoln.glb']=venueGLB;
  files[`${slug}/data/surfaces.ini`]=strToU8('[SURFACE_0]\nKEY=PROAD\nFRICTION=1\nDAMPING=0\nIS_VALID_TRACK=1\nIS_PITLANE=0\nBLACK_FLAG_TIME=0\n[SURFACE_1]\nKEY=GRASS\nFRICTION=1.05\nDAMPING=0\nIS_VALID_TRACK=1\nIS_PITLANE=0\nBLACK_FLAG_TIME=0\n');
  files['README.txt']=strToU8(readme+'\nLINCOLN VENUE: lincoln.glb replaces generated pads. Original venue positions are translated by +22.86 m X, +518.16 m Z into editor coordinates; geometry retains its elevations. Textures are resized and materials approximated for portability. Preserve 1PROAD and 1GRASS names and configure ksEditor shaders. Grid overlay is a measuring aid, not surveyed joint alignment.\n');
 }
 return {slug,files,zip:zipSync(files)};
}
