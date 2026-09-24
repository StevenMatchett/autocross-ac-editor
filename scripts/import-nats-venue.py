"""Convert the pinned Nationals venue to a browser/Blender GLB plus road data.
Requires NumPy and Pillow. Usage: python scripts/import-nats-venue.py tmp/venue-kn5
Actual KN5 files (not LFS pointers) must be downloaded before running.
"""
from pathlib import Path
import sys,io,json,struct,gzip,hashlib
import numpy as np
from PIL import Image
from kn5 import load
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]);OUT=ROOT/'public/venue';OUT.mkdir(parents=True,exist_ok=True)
NAMES=['lincoln_road','lincoln_038ampt','lincoln_038bmpt','lincoln_grass','lincoln_3mpt','lincoln_1mpt','lincoln_019mpt','lincoln_trees','lincoln_scenery_objects']
# Translate native KN5 coordinates to a positive editor rectangle. No scaling/rotation.
OFFSET=np.array([22.86,0,518.16]);COLUMNS=84;ROWS=74
binary=bytearray();gltf=dict(asset={'version':'2.0','generator':'Padwork Nationals venue conversion'},extensionsUsed=['KHR_materials_unlit'],scene=0,scenes=[{'nodes':[]}],nodes=[],meshes=[],materials=[],textures=[],images=[],samplers=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],bufferViews=[],accessors=[])
texture_cache={};material_count=0;manifest=[];road=None

def blob(data):
 while len(binary)%4:binary.append(0)
 start=len(binary);binary.extend(data);i=len(gltf['bufferViews']);gltf['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(data)});return i

def accessor(array,typ,component):
 array=np.ascontiguousarray(array);view=blob(array.tobytes());a={'bufferView':view,'componentType':component,'count':len(array),'type':typ}
 if typ=='VEC3':a.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
 i=len(gltf['accessors']);gltf['accessors'].append(a);return i

def texture(raw,alpha):
 key=(hashlib.sha256(raw).hexdigest(),alpha)
 if key in texture_cache:return texture_cache[key]
 im=Image.open(io.BytesIO(raw)).convert('RGBA' if alpha else 'RGB')
 # Retain the apron imagery at 4096; distant photo meshes need only 1024.
 size=4096 if im.width>=8192 else 1024
 im.thumbnail((size,size),Image.Resampling.LANCZOS)
 encoded=io.BytesIO();im.save(encoded,format='PNG' if alpha else 'JPEG',**({} if alpha else {'quality':88}))
 view=blob(encoded.getvalue());index=len(gltf['images']);gltf['images'].append({'bufferView':view,'mimeType':'image/png' if alpha else 'image/jpeg'})
 gltf['textures'].append({'sampler':0,'source':index});texture_cache[key]=index;return index

for name in NAMES:
 path=SOURCE/(name+'.kn5')
 # Verify source objects against the previously inspected pinned repository pointers.
 record=json.loads((ROOT/'src/assets/venue.json').read_text())
 expected=next(item['sha256'] for item in record['files'] if item['file']==path.name)
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 if digest!=expected:raise ValueError('Wrong source version: '+name)
 textures,materials,meshes=load(path)
 mat_start=len(gltf['materials'])
 for m in materials:
  alpha=m['shader'] in ['ksTree','ksPerPixelAT','ksPerPixelAlpha'] or bool(m['alpha'])
  material={'name':m['name'],'doubleSided':alpha,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1}}
  diffuse=m['maps'].get('txDiffuse')
  if diffuse in textures:material['pbrMetallicRoughness']['baseColorTexture']={'index':texture(textures[diffuse],alpha)}
  if alpha:material.update(alphaMode='MASK',alphaCutoff=.35)
  if m['shader']=='ksTree':material['extensions']={'KHR_materials_unlit':{}}
  gltf['materials'].append(material)
 count=0
 for m in meshes:
  if not m['visible']:continue
  p=m['positions']+OFFSET
  if name=='lincoln_trees':p+=np.array([143,0,-249])
  # KN5 UVs are bottom-origin; glTF UVs are top-origin. Restore source V.
  uv=m['uv']*[1,-1]
  attributes={'POSITION':accessor(p.astype('<f4'),'VEC3',5126),'NORMAL':accessor(m['normals'].astype('<f4'),'VEC3',5126),'TEXCOORD_0':accessor(uv.astype('<f4'),'VEC2',5126)}
  mesh_index=len(gltf['meshes']);gltf['meshes'].append({'name':m['name'],'primitives':[{'attributes':attributes,'indices':accessor(m['indices'].astype('<u2'),'SCALAR',5123),'material':mat_start+m['material']}]})
  node_index=len(gltf['nodes']);gltf['nodes'].append({'name':m['name'],'mesh':mesh_index});gltf['scenes'][0]['nodes'].append(node_index);count+=1
  if name=='lincoln_road':road={'positions':p.astype('<f4'),'indices':m['indices'].astype('<u4')}
 manifest.append({'file':path.name,'sha256':digest,'meshes':count})
 print(name,count,flush=True)
while len(binary)%4:binary.append(0)
gltf['buffers']=[{'byteLength':len(binary)}]
js=json.dumps(gltf,separators=(',',':')).encode()
while len(js)%4:js+=b' '
glb=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
(OUT/'lincoln.glb.gz').write_bytes(gzip.compress(glb,compresslevel=9,mtime=0))
# Compact exact road triangles used by both runtime grounding and driveable-area checks.
road_bytes=struct.pack('<II',len(road['positions']),len(road['indices']))+road['positions'].tobytes()+road['indices'].tobytes()
(OUT/'road.bin.gz').write_bytes(gzip.compress(road_bytes,mtime=0))
meta={'id':'lincoln','name':'Lincoln Nationals','columns':COLUMNS,'rows':ROWS,'offset':OFFSET.tolist(),'sourceCommit':'1742a96633537278dfc4f647a984e45fed8de647','files':manifest,'meshCount':len(gltf['meshes']),'triangleCount':sum(a['count']//3 for a in gltf['accessors'] if a['type']=='SCALAR'),'downloadBytes':(OUT/'lincoln.glb.gz').stat().st_size,'glbBytes':len(glb)}
(ROOT/'src/assets/venue.json').write_text(json.dumps(meta,indent=2)+'\n')
print('GLB MB',len(glb)/1e6,'download MB',meta['downloadBytes']/1e6,'triangles',meta['triangleCount'])
