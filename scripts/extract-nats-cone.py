"""Extract original cone templates. Requires Pillow; input is the pinned 2021 KN5.
Usage: python scripts/extract-nats-cone.py /path/to/lincoln_2021_course.kn5
"""
import struct, json, sys, hashlib, io, base64, math
from pathlib import Path
from PIL import Image
raw=Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(raw).hexdigest()=='eaee64e78b812ddd428f4f03c77354150f8230b75719f4497936b2f6891f3e1a', 'Expected original 2021 course'
f=io.BytesIO(raw)
def read(fmt):return struct.unpack('<'+fmt,f.read(struct.calcsize('<'+fmt)))
def u():return read('I')[0]
def string():return f.read(u()).decode()
assert read('6sI')==(b'sc6969',6)
u();textures={}
for _ in range(u()):
 u();name=string();textures[name]=f.read(u())
for _ in range(u()):
 string();string();f.read(6)
 for _ in range(u()):string();f.read(40)
 for _ in range(u()):string();u();string()
meshes={}
def node():
 kind=u();name=string();children=u();f.read(1)
 if kind==1:f.read(64)
 elif kind==2:
  f.read(3);vertices=[read('11f') for _ in range(u())];indices=read(str(u())+'H');u();f.read(29)
  meshes[name]=(vertices,indices)
 else:raise ValueError('Unsupported node')
 for _ in range(children):node()
node();assert f.tell()==len(raw)
upright=meshes['1WALL_cone_west_upright'][0][:36]
low=min(v[1] for v in upright);high=max(v[1] for v in upright);scale=.4572/(high-low)
bottom=[i for i,v in enumerate(upright) if abs(v[1]-low)<.00001]
top=[i for i,v in enumerate(upright) if abs(v[1]-high)<.00001]
result={}
for kind,name in [('cone','1WALL_cone_west_upright'),('pointer','2WALL_cone_west_pointer')]:
 vertices,indices=meshes[name];verts=vertices[:36]
 faces=[indices[i:i+3] for i in range(0,len(indices),3) if min(indices[i:i+3])<36]
 assert len(faces)==44 and all(max(face)<36 for face in faces), 'Cone must be a separate component'
 center=[sum(verts[i][j] for i in bottom)/len(bottom) for j in range(3)]
 angle=0
 if kind=='pointer':
  tip=[sum(verts[i][j] for i in top)/len(top) for j in range(3)]
  dx,dz=tip[0]-center[0],tip[2]-center[2]
  angle=math.atan2(dx,-dz)
 c,s=math.cos(angle),math.sin(angle)
 positions=[];normals=[];uv=[]
 for v in verts:
  x,y,z=v[0]-center[0],v[1],v[2]-center[2]
  positions.append([(c*x+s*z)*scale,y*scale,(-s*x+c*z)*scale])
  nx,ny,nz=v[3:6];normals.extend([c*nx+s*nz,ny,-s*nx+c*nz]);uv.extend([v[6],1-v[7]])
 floor=min(v[1] for v in positions)
 for v in positions:v[1]-=floor
 result[kind]={'positions':[round(n,8) for v in positions for n in v],'normals':[round(n,8) for n in normals],'uv':[round(n,8) for n in uv],'indices':[n for face in faces for n in face]}
 # The original file's mesh normals determine winding; keep the source indices.
 result[kind]['bounds']=[[min(v[i] for v in positions),max(v[i] for v in positions)] for i in range(3)]
png=io.BytesIO();Image.open(io.BytesIO(textures['ConePaintTexture.dds'])).convert('RGBA').save(png,format='PNG')
result['texturePNG']=base64.b64encode(png.getvalue()).decode()
result['source']='https://github.com/schmerchak/nats-mod/tree/1742a96633537278dfc4f647a984e45fed8de647'
out=Path(__file__).resolve().parents[1]/'src/assets/nats-cone.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(out, out.stat().st_size, 'bytes')
print({k:result[k]['bounds'] for k in ['cone','pointer']})
