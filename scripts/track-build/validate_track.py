# SPDX-License-Identifier: GPL-3.0-only
"""Independent strict KN5 reader and course/package checks. Standard library only."""
import io
import json
import math
import struct
import zipfile
import zlib
from pathlib import Path

REQUIRED_MARKERS={'AC_PIT_0','AC_HOTLAP_START_0','AC_AB_START_L','AC_AB_START_R','AC_AB_FINISH_L','AC_AB_FINISH_R'}

def multiply(a,b): return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]
def identity(): return [[float(i==j) for j in range(4)] for i in range(4)]
def transform(p,m): return tuple(sum(p[k]*m[k][i] for k in range(3))+m[3][i] for i in range(3))

def read_kn5(path):
    data=Path(path).read_bytes(); stream=io.BytesIO(data)
    def take(n):
        if n<0 or n>len(data)-stream.tell(): raise ValueError('Truncated KN5')
        return stream.read(n)
    def unpack(fmt): return struct.unpack('<'+fmt,take(struct.calcsize('<'+fmt)))
    def uint(): return unpack('I')[0]
    def count(size=1):
        n=uint()
        if n>(len(data)-stream.tell())//size: raise ValueError('Invalid KN5 count')
        return n
    def string(): return take(count()).decode('utf8')
    if take(6)!=b'sc6969': raise ValueError('Invalid KN5 signature')
    version=uint()
    if version not in (5,6): raise ValueError('Unsupported KN5 version')
    if version==6: uint()
    textures={}
    for _ in range(count(12)):
        active=uint(); name=string(); blob=take(count())
        if name in textures or not blob: raise ValueError('Duplicate or empty texture '+name)
        if not blob.startswith((b'\x89PNG\r\n\x1a\n',b'DDS ')): raise ValueError('Unsupported texture data '+name)
        textures[name]=blob
    materials=[]
    for _ in range(count(14)):
        name=string(); shader=string(); blend,alpha,depth=unpack('BBI'); props={}
        for _ in range(count(44)):
            key=string(); props[key]=unpack('10f')
            if not all(math.isfinite(v) for v in props[key]): raise ValueError('Non-finite material property')
        maps={}
        for _ in range(count(12)):
            key=string(); slot=uint(); texture=string()
            if texture not in textures: raise ValueError('Missing embedded texture '+texture)
            maps[key]=texture
        materials.append(dict(name=name,shader=shader,maps=maps,properties=props,blend=blend,alpha=alpha))
    meshes=[]; nodes={}
    def node(parent,depth=0):
        if depth>64: raise ValueError('Excessive KN5 node depth')
        kind=uint(); name=string(); children=count(); active=take(1); world=parent
        if kind==1:
            values=unpack('16f'); local=[list(values[i:i+4]) for i in range(0,16,4)]
            if not all(math.isfinite(v) for v in values): raise ValueError('Non-finite node matrix')
            world=multiply(local,parent)
            if name.startswith('AC_') and name in nodes: raise ValueError('Duplicate marker '+name)
            nodes[name]=world
        elif kind==2:
            cast,visible,transparent=unpack('3B'); size=count(44)
            if not 0<size<=65535: raise ValueError('KN5 vertex limit exceeded: '+name)
            vertices=[unpack('11f') for _ in range(size)]
            if not all(math.isfinite(v) for vertex in vertices for v in vertex): raise ValueError('Non-finite vertex '+name)
            n=count(2)
            if n%3: raise ValueError('Non-triangular index buffer '+name)
            indices=unpack(str(n)+'H')
            if not indices or max(indices)>=size: raise ValueError('Invalid mesh index '+name)
            material=uint()
            if material>=len(materials): raise ValueError('Invalid material ID '+name)
            layer,lod_in,lod_out,cx,cy,cz,radius,renderable=unpack('I6fB')
            meshes.append(dict(name=name,vertices=vertices,positions=[transform(v[:3],world) for v in vertices],indices=indices,material=material,renderable=bool(renderable)))
        else: raise ValueError('Unsupported KN5 node type '+str(kind))
        for _ in range(children): node(world,depth+1)
    node(identity())
    if stream.tell()!=len(data): raise ValueError('KN5 trailing bytes')
    return textures,materials,meshes,nodes

def expected_markers(layout,elevations):
    result={}
    for item in layout['items']:
        a=math.radians(item['angle']); x,z=item['x'],item['z']; y=elevations[item['id']]+1
        if item['kind']=='stage': names=[('AC_PIT_0',x,z),('AC_HOTLAP_START_0',x,z)]
        elif item['kind'] in ('start','finish'):
            prefix='AC_AB_START' if item['kind']=='start' else 'AC_AB_FINISH'
            half=item.get('width',6.096)/2
            names=[(prefix+'_'+side,x+sign*half*math.cos(a),z+sign*half*math.sin(a)) for side,sign in [('L',-1),('R',1)]]
        else: continue
        for name,mx,mz in names: result[name]=((mx,y,mz),(0,1,0),(math.sin(a),0,-math.cos(a)))
    return result

def pavement_index(meshes):
    cells={}; faces=0; down=0
    for mesh in meshes:
        if not (mesh['name'].startswith('1PROAD') or mesh['name'].startswith('1ROAD')): continue
        p=mesh['positions']; idx=mesh['indices']
        for i in range(0,len(idx),3):
            a,b,c=(p[idx[i+j]] for j in range(3))
            # Cross-product Y component must point up for physical pavement.
            cross=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])
            if abs(cross)<1e-8: continue
            # Generated pads are closed 20cm cubes; their underside is not a
            # driving face. Exclude only the known bottom, never a flipped top.
            if cross<0 and mesh['name'].startswith('1ROAD_pad_') and all(abs(p[1]+.2)<1e-5 for p in (a,b,c)): continue
            faces+=1
            if cross<0: down+=1
            for x in range(math.floor(min(a[0],b[0],c[0])/10),math.floor(max(a[0],b[0],c[0])/10)+1):
                for z in range(math.floor(min(a[2],b[2],c[2])/10),math.floor(max(a[2],b[2],c[2])/10)+1): cells.setdefault((x,z),[]).append((a,b,c))
    if not faces: raise ValueError('No physical pavement')
    if down: raise ValueError('Physical pavement contains downward faces')
    return cells,faces,down

def pavement_height(cells,x,z):
    heights=[]
    for a,b,c in cells.get((math.floor(x/10),math.floor(z/10)),[]):
        den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2])
        if abs(den)<1e-10: continue
        u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den
        v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den
        if u>=-1e-5 and v>=-1e-5 and u+v<=1+1e-5: heights.append(u*a[1]+v*b[1]+(1-u-v)*c[1])
    return max(heights) if heights else None

def validate(root,slug):
    import re
    if not re.fullmatch(r'[a-z0-9_]{1,32}',slug): raise ValueError('Invalid track slug')
    root=Path(root); track=root/slug
    layout=json.loads((root/'layout.json').read_text()); elevations=json.loads((root/'elevations.json').read_text())
    textures,materials,meshes,nodes=read_kn5(track/(slug+'.kn5'))
    expected=expected_markers(layout,elevations)
    if set(expected)!=REQUIRED_MARKERS or set(n for n in nodes if n.startswith('AC_'))!=REQUIRED_MARKERS: raise ValueError('Expected all six spawn/timing markers')
    for name,(position,up,forward) in expected.items():
        matrix=nodes[name]
        for actual,target in [(matrix[3][:3],position),(matrix[1][:3],up),(matrix[2][:3],forward)]:
            if math.dist(actual,target)>.001: raise ValueError('Marker position/up/heading mismatch: '+name)
    expected_cones={f"1WALL_{item['kind']}_{index:04d}" for index,item in enumerate(layout['items']) if item['kind'] in ('cone','pointer')}
    actual_cones={m['name'] for m in meshes if m['name'].startswith(('1WALL_cone_','1WALL_pointer_'))}
    if expected_cones!=actual_cones: raise ValueError('Cone names/counts do not match layout')
    # Check baked cone geometry against the authored templates, including heading.
    assets=json.loads((root/'cone-assets.json').read_text())
    cone_meshes={name:[m for m in meshes if m['name']==name] for name in expected_cones}
    visible_cones={m['name']:m for m in meshes if m['name'].startswith(('cone_','pointer_'))}
    if set(visible_cones)!={name.removeprefix('1WALL_') for name in expected_cones}: raise ValueError('Visible cone names/counts mismatch')
    for index,item in enumerate(layout['items']):
        if item['kind'] not in ('cone','pointer'): continue
        name=f"1WALL_{item['kind']}_{index:04d}"
        a=math.radians(item['angle']); cos,sin=math.cos(a),math.sin(a)
        if any(mesh['renderable'] for mesh in cone_meshes[name]): raise ValueError('Cone collider must be nonrenderable: '+name)
        visual=visible_cones[name.removeprefix('1WALL_')]
        if not visual['renderable']: raise ValueError('Visible cone must be renderable: '+name)
        actual=visual['positions']
        source=assets[item['kind']]['positions']; expected_positions=[]
        for i in range(0,len(source),3):
            x,y,z=source[i:i+3]
            expected_positions.append((item['x']+x*cos-z*sin,elevations[item['id']]+y,item['z']+x*sin+z*cos))
        if any(min(math.dist(p,q) for q in expected_positions)>.001 for p in actual) or any(min(math.dist(p,q) for q in actual)>.001 for p in expected_positions):
            raise ValueError('Cone transform differs from authored placement: '+name)
        # Raised box footprint and height must match the latest authored collider.
        xs=source[0::3]; zs=source[2::3]
        cx=(min(xs)+max(xs))/2; cz=(min(zs)+max(zs))/2
        hx=max(max(xs)-min(xs),.35)/2; hz=max(max(zs)-min(zs),.35)/2
        box_expected=[(item['x']+x*cos-z*sin,elevations[item['id']]+y,item['z']+x*sin+z*cos) for x in (cx-hx,cx+hx) for z in (cz-hz,cz+hz) for y in (-.02,1.2)]
        box_actual=[p for mesh in cone_meshes[name] for p in mesh['positions']]
        if any(min(math.dist(p,q) for q in box_expected)>.001 for p in box_actual) or any(min(math.dist(p,q) for q in box_actual)>.001 for p in box_expected):
            raise ValueError('Raised cone collider transform/height mismatch: '+name)
    cells,faces,down=pavement_index(meshes); errors=[]
    for item in layout['items']:
        y=pavement_height(cells,item['x'],item['z'])
        if y is None: raise ValueError('Authored position misses pavement: '+item['id'])
        error=abs(y-elevations[item['id']]); errors.append(error)
        if error>.001: raise ValueError('Authored elevation differs from pavement: '+item['id'])
    models=(track/'models.ini').read_text()
    if models.replace('\r','').strip()!=f'[MODEL_0]\nFILE={slug}.kn5\nPOSITION=0,0,0\nROTATION=0,0,0': raise ValueError('Invalid models.ini reference')
    if 'KEY=WALL' not in (track/'data/surfaces.ini').read_text(): raise ValueError('Missing WALL surface')
    if not (track/'ASSET_CREDITS.txt').read_text().strip(): raise ValueError('Missing asset credits')
    report=dict(status='compiled/validated; not in-game tested',textures=len(textures),materials=len(materials),mesh_parts=len(meshes),cones=len(visible_cones),colliders=len(actual_cones),markers=len(expected),authored_positions=len(errors),maximum_elevation_error_m=max(errors,default=0),pavement_faces=faces,downward_faces=down)
    (root/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

def preview(path,layout):
    # Portable overhead course diagram; no render engine or GPU required.
    width,height=640,400; pixels=bytearray(bytes((92,96,94))*width*height)
    items=layout['items']; xs=[i['x'] for i in items]; zs=[i['z'] for i in items]
    scale=min((width-40)/max(max(xs)-min(xs),1),(height-40)/max(max(zs)-min(zs),1))
    for item in items:
        x=int(20+(item['x']-min(xs))*scale); z=int(20+(item['z']-min(zs))*scale)
        color=(255,143,49) if item['kind'] in ('cone','pointer') else (100,220,155)
        for dy in range(-2,3):
            for dx in range(-2,3):
                if 0<=x+dx<width and 0<=z+dy<height: pixels[((z+dy)*width+x+dx)*3:((z+dy)*width+x+dx)*3+3]=bytes(color)
    def chunk(name,data): return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
    scan=b''.join(b'\0'+pixels[i*width*3:(i+1)*width*3] for i in range(height))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(scan))+chunk(b'IEND',b''))

def package(root,slug):
    import re
    if not re.fullmatch(r'[a-z0-9_]{1,32}',slug): raise ValueError('Invalid track slug')
    root=Path(root); track=root/slug
    preview(track/'ui/preview.png',json.loads((root/'layout.json').read_text()))
    required={slug+'.kn5','models.ini','data/surfaces.ini','ui/ui_track.json','ui/preview.png','ASSET_CREDITS.txt'}
    path=root/(slug+'-install.zip'); prefix='content/tracks/'+slug+'/'
    with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in sorted(required): archive.write(track/relative,prefix+relative)
    with zipfile.ZipFile(path) as archive:
        if set(archive.namelist())!={prefix+p for p in required} or archive.testzip(): raise ValueError('Invalid installation ZIP paths/data')
        if archive.read(prefix+'models.ini')!=(track/'models.ini').read_bytes(): raise ValueError('ZIP model reference mismatch')
    return path

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(); parser.add_argument('export',type=Path); args=parser.parse_args()
    slug=json.loads((args.export/'build.json').read_text())['slug']
    print(json.dumps(validate(args.export,slug),indent=2))
    print(package(args.export,slug))
