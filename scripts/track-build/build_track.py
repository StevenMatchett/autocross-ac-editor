# SPDX-License-Identifier: GPL-3.0-only
# Run: blender --background --python build_track.py
# Creates a NEW scene. Run in a fresh Blender session.
import bpy, json, math, sys, struct
from pathlib import Path
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
slug = json.loads((ROOT / 'build.json').read_text())['slug']
layout = json.loads((ROOT / 'layout.json').read_text())
cone_assets = json.loads((ROOT / 'cone-assets.json').read_text())
elevations = json.loads((ROOT / 'elevations.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1.0
PAD = 7.62
HEIGHT = 0.4572
BASE = 0.2914
COLLIDER_HEIGHT = 1.2  # Reach above a car bumper even where the cone tapers.
width, depth = layout['columns']*PAD, layout['rows']*PAD
def material(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = False
    m.diffuse_color = (*color, 1)
    m['ac_color'] = (*color, 1)
    return m
concrete = [material('Concrete_'+str(i), (0.48+i*0.012, 0.49+i*0.012, 0.47+i*0.012)) for i in range(4)]
collision_material = material('Cone_collision_hide_in_ksEditor', (.1, .7, 1))
def cone_material(index):
    m = material('Cone_%04d'%index, (1, .22, .035))
    m['ac_tint'] = cone_assets['tints'][str(index)]
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
    glb=(ROOT/'lincoln.glb').read_bytes()
    json_length=struct.unpack_from('<I',glb,12)[0]
    source_materials=json.loads(glb[20:20+json_length])['materials']
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'lincoln.glb'))
    for source in source_materials:
        mat=bpy.data.materials.get(source['name'])
        if mat is None: raise ValueError('Imported material missing: '+source['name'])
        mat['ac_alpha_mode']=source.get('alphaMode','OPAQUE')
        mat['ac_alpha_cutoff']=source.get('alphaCutoff',.5)

    # Force lazy glTF images to load, extract packed bytes, and convert when needed.
    from direct_kn5 import extract_image
    for index,image in enumerate(bpy.data.images):
        if image.type=='IMAGE': extract_image(image, ROOT/'texture', 'venue_%03d'%index)
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
        obj=bpy.data.objects.new(item['kind']+'_%04d'%index,mesh)
        bpy.context.collection.objects.link(obj);obj.location=(x,-z,elevation)
        obj.rotation_euler.z=-math.radians(a);mesh.materials.append(orange)
        # A closed, raised box catches a car at bumper height. The original cone
        # stays visual-only so its sloping sides cannot let the car ride over it.
        local_x=[p[i] for i in range(0,len(p),3)]
        local_y=[-p[i+2] for i in range(0,len(p),3)]
        min_x,max_x=min(local_x),max(local_x)
        min_y,max_y=min(local_y),max(local_y)
        collider=cube('1WALL_'+item['kind']+'_%04d'%index,
            (x,-z,elevation+COLLIDER_HEIGHT/2-.01),
            (max(max_x-min_x,.35),max(max_y-min_y,.35),COLLIDER_HEIGHT+.02),
            collision_material)
        offset=Vector(((min_x+max_x)/2,(min_y+max_y)/2,0))
        collider.location += Matrix.Rotation(-math.radians(a),4,'Z') @ offset
        collider.rotation_euler.z=-math.radians(a)
    elif item['kind']=='stage':
        marker('AC_PIT_0',x,z,a,elevation)
        marker('AC_HOTLAP_START_0',x,z,a,elevation)
    else:
        prefix='AC_AB_START' if item['kind']=='start' else 'AC_AB_FINISH'
        a_rad=math.radians(a)
        for side,sign in [('L',-1),('R',1)]:
            marker(prefix+'_'+side,x+sign*item.get('width',6.096)/2*math.cos(a_rad),z+sign*item.get('width',6.096)/2*math.sin(a_rad),a,elevation)
bpy.context.view_layer.update()
from direct_kn5 import build
build(ROOT, slug, layout, elevations)
