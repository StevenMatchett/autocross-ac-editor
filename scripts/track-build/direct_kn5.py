# SPDX-License-Identifier: GPL-3.0-only
# Adapted from nendotools/ac-track-tools, commit 3940bb90614efb82707a0964836563b11dd11f7f.
# See EXPORTER_NOTICE.txt and COPYING. Explicit settings replace addon properties.
import hashlib
import math
import struct
from pathlib import Path

LIMIT = 65535

class Writer:
    def __init__(self, stream): self.stream = stream
    def pack(self, fmt, *values): self.stream.write(struct.pack('<'+fmt, *values))
    def string(self, value):
        data=value.encode('utf8'); self.pack('I',len(data)); self.stream.write(data)
    def matrix(self, value): self.pack('16f', *(value[col][row] for row in range(4) for col in range(4)))
    def node(self, name, children, matrix):
        self.pack('I',1); self.string(name); self.pack('IB',children,1); self.matrix(matrix)

def extract_image(image, directory, basename):
    """Never use has_data as a gate: glTF images can be packed and lazily decoded."""
    import bpy
    directory.mkdir(parents=True,exist_ok=True)
    path=directory/(basename+'.png')
    packed=image.packed_file
    data=bytes(packed.data) if packed else None
    if data and data.startswith(b'\x89PNG\r\n\x1a\n'):
        path.write_bytes(data)
    else:
        # Pixel access forces decode; use a real temporary source for packed JPEG etc.
        if data:
            source=directory/(basename+'.source'); source.write_bytes(data)
            copy=bpy.data.images.load(str(source),check_existing=False)
        else:
            copy=image.copy(); source=None
        try:
            if not len(copy.pixels):
                copy.reload()
            if not len(copy.pixels): raise ValueError('Cannot load texture '+image.name)
            copy.filepath_raw=str(path); copy.file_format='PNG'; copy.save()
        finally:
            bpy.data.images.remove(copy)
            if source: source.unlink(missing_ok=True)
    if not path.is_file() or not path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Failed to extract PNG: '+image.name)
    # Both FBX and direct exporter now use the same concrete path.
    image.filepath_raw=str(path); image.file_format='PNG'
    return path

def material_settings(material, root, textures):
    import bpy
    shader=material.node_tree.nodes.get('Principled BSDF') if material.use_nodes else None
    color=shader.inputs['Base Color'].default_value[:] if shader else material.diffuse_color[:]
    color=tuple(material.get('ac_color',color))
    image=None
    if shader:
        # Follow Base Color links, including the cone brightness Multiply node.
        pending=[link.from_node for link in shader.inputs['Base Color'].links]; visited=set()
        while pending:
            node=pending.pop()
            if node in visited: continue
            visited.add(node)
            if node.type=='TEX_IMAGE' and node.image: image=node.image; break
            pending.extend(link.from_node for socket in node.inputs for link in socket.links)
    if image:
        # Extract by image identity once; hash names avoid all filename collisions.
        key=image.name
        if key not in textures:
            stem='tex_'+hashlib.sha256(key.encode()).hexdigest()[:16]
            path=extract_image(image,root/'texture',stem)
            textures[key]=(path.name,path.read_bytes())
    else:
        key='solid_'+str(tuple(round(c,6) for c in color))
        if key not in textures:
            image=bpy.data.images.new(key,width=1,height=1,alpha=True)
            image.pixels=tuple(color)
            path=extract_image(image,root/'texture','tex_'+hashlib.sha256(key.encode()).hexdigest()[:16])
            textures[key]=(path.name,path.read_bytes())
    alpha=shader.inputs['Alpha'] if shader else None
    transparent=bool(alpha and (alpha.is_linked or alpha.default_value<.999)) or color[3]<.999
    mode=material.get('ac_alpha_mode')
    if mode is not None:
        transparent=mode in ('MASK','BLEND')
        blend=int(mode=='BLEND')
    else:
        blend=1 if transparent and ((alpha and not alpha.is_linked) or getattr(material,'surface_render_method','')=='BLENDED' or getattr(material,'blend_method','')=='BLEND') else 0
    tint=float(material.get('ac_tint',1))
    return dict(name=material.name,texture=textures[key][0],blend=blend,alpha=int(transparent and not blend),transparent=transparent,
                properties={'ksAmbient':.4*tint,'ksDiffuse':.4*tint,'ksSpecular':.1,'ksSpecularEXP':20,'ksAlphaRef':float(material.get('ac_alpha_cutoff',.5))})

def write_material(w, settings):
    w.string(settings['name']); w.string('ksPerPixel')
    w.pack('BBI',settings['blend'],settings['alpha'],0)
    w.pack('I',len(settings['properties']))
    for name,value in settings['properties'].items(): w.string(name); w.pack('10f',value,*([0]*9))
    w.pack('I',1); w.string('txDiffuse'); w.pack('I',0); w.string(settings['texture'])

def split_triangles(triangles, limit=LIMIT):
    """Split complete triangles, preserving vertex seams and material boundaries."""
    vertices=[]; indices=[]; lookup={}
    for triangle in triangles:
        if len(lookup)+sum(1 for vertex in set(triangle) if vertex not in lookup)>limit:
            yield vertices,indices
            vertices=[]; indices=[]; lookup={}
        for vertex in triangle:
            if vertex not in lookup: lookup[vertex]=len(vertices); vertices.append(vertex)
            indices.append(lookup[vertex])
    if indices: yield vertices,indices

def mesh_parts(obj, materials, context):
    import bpy
    from mathutils import Matrix
    # Geometry, custom normals and tangents share one baked world transform.
    mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(context.evaluated_depsgraph_get()))
    transform=obj.matrix_world.copy()
    mesh.transform(transform)
    if transform.determinant()<0: mesh.flip_normals()
    mesh.update(); mesh.calc_loop_triangles()
    if mesh.uv_layers: mesh.calc_tangents()
    C=Matrix(((1,0,0),(0,0,1),(0,-1,0)))
    try:
        groups={}
        uv=mesh.uv_layers.active
        for tri in mesh.loop_triangles:
            mat=mesh.materials[tri.material_index] if mesh.materials else None
            if mat is None: raise ValueError('Missing material: '+obj.name)
            vertices=[]
            for index in tri.loops:
                loop=mesh.loops[index]
                pos=C @ mesh.vertices[loop.vertex_index].co
                normal=C @ loop.normal
                tangent=C @ loop.tangent if uv else C @ loop.normal.orthogonal().normalized()
                tex=uv.data[index].uv if uv else (0,0)
                vertices.append(tuple(pos)+tuple(normal)+(tex[0],-tex[1])+tuple(tangent))
            groups.setdefault(materials[mat.name],[]).append(tuple(vertices))
        for mat_id,triangles in groups.items():
            for vertices,indices in split_triangles(triangles): yield obj.name,mat_id,vertices,indices
    finally: bpy.data.meshes.remove(mesh)

def write_mesh(w, name, material, vertices, indices, transparent, renderable=True):
    w.pack('I',2); w.string(name); w.pack('IBBBB',0,1,int(renderable),1,int(transparent))
    w.pack('I',len(vertices))
    for v in vertices: w.pack('11f',*v)
    w.pack('I',len(indices)); w.pack(str(len(indices))+'H',*indices)
    low=[min(v[i] for v in vertices) for i in range(3)]; high=[max(v[i] for v in vertices) for i in range(3)]
    center=[(a+b)/2 for a,b in zip(low,high)]
    radius=max(math.dist(v[:3],center) for v in vertices)
    w.pack('II6fB',material,0,0,100000,*center,radius,int(renderable))

def build(root, slug, layout, elevations):
    import bpy
    from mathutils import Matrix
    from validate_track import validate, package
    objects=sorted((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:o.name)
    materials=sorted({slot.material for obj in objects for slot in obj.material_slots if slot.material},key=lambda m:m.name)
    print('Converting materials and embedding textures...',flush=True)
    textures={}; settings=[material_settings(m,root,textures) for m in materials]
    ids={m.name:i for i,m in enumerate(materials)}
    print('Baking mesh transforms and splitting geometry...',flush=True)
    parts=[part for obj in objects for part in mesh_parts(obj,ids,bpy.context)]
    markers=sorted((o for o in bpy.context.scene.objects if o.name.startswith('AC_')),key=lambda o:o.name)
    track=root/slug; track.mkdir(exist_ok=True)
    path=track/(slug+'.kn5')
    C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
    with path.open('wb') as stream:
        w=Writer(stream); stream.write(b'sc6969'); w.pack('II',5,len(textures))
        for name,data in textures.values(): w.pack('I',1); w.string(name); w.pack('I',len(data)); stream.write(data)
        w.pack('I',len(settings))
        for mat in settings: write_material(w,mat)
        w.node('Padwork',len(parts)+len(markers),Matrix.Identity(4))
        for name,mat,vertices,indices in parts: write_mesh(w,name,mat,vertices,indices,settings[mat]['transparent'],not name.startswith(('1WALL_cone_','1WALL_pointer_')))
        for marker in markers:
            # Source marker columns already mean local Y-up/Z-forward. The generic
            # upstream convert_matrix changes BOTH bases (C M C^-1); that would
            # convert the local axes twice here. Convert world basis only: C M.
            w.node(marker.name,0,C @ marker.matrix_world)
    print('Parsing KN5 and validating course geometry...',flush=True)
    report=validate(root,slug)
    # Keep editable sources; FBX is an optional ksEditor fallback.
    bpy.ops.wm.save_as_mainfile(filepath=str(root/(slug+'.blend')))
    import sys
    if '--fbx' in sys.argv:
        bpy.ops.export_scene.fbx(filepath=str(root/(slug+'.fbx')),use_selection=False,object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',path_mode='COPY',add_leaf_bones=False)
    zip_path=package(root,slug)
    print('Compiled and validated:',path,'\nInstallation ZIP:',zip_path,'\nIn-game spawn, timing and cone collisions still require Practice checks.')
    return report
