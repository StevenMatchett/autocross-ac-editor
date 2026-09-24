"""Read the static KN5 v5/v6 subset used by the Nationals venue (NumPy required)."""
import io, struct
from pathlib import Path
import numpy as np

def load(path):
    stream=io.BytesIO(Path(path).read_bytes())
    def take(n):
        data=stream.read(n)
        if len(data)!=n: raise ValueError('Truncated KN5')
        return data
    def number():return struct.unpack('<I',take(4))[0]
    def string():return take(number()).decode('utf-8')
    if take(6)!=b'sc6969':raise ValueError('Not a KN5 file; fetch actual Git LFS data')
    version=number()
    if version not in (5,6):raise ValueError('Unsupported KN5 version')
    if version==6:number()
    textures={}
    for _ in range(number()):
        active=number();name=string();textures[name]=take(number())
    materials=[]
    for _ in range(number()):
        name,shader=string(),string();blend,alpha=take(2);depth=number();properties={}
        for _ in range(number()):
            key=string();properties[key]=struct.unpack('<10f',take(40))
        maps={}
        for _ in range(number()):
            key=string();number();maps[key]=string()
        materials.append(dict(name=name,shader=shader,blend=blend,alpha=alpha,properties=properties,maps=maps))
    meshes=[]
    def node(parent,visible=True):
        kind=number();name=string();children=number();active=bool(take(1)[0]);world=parent
        if kind==1:
            world=np.frombuffer(take(64),dtype='<f4').reshape(4,4)@parent
        elif kind==2:
            cast,show,transparent=take(3)
            vertices=np.frombuffer(take(number()*44),dtype='<f4').reshape(-1,11).copy()
            indices=np.frombuffer(take(number()*2),dtype='<u2').copy();material=number();take(29)
            xyz=vertices[:,:3]@world[:3,:3]+world[3,:3]
            normals=vertices[:,3:6]@np.linalg.inv(world[:3,:3]).T
            normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-8)
            meshes.append(dict(name=name,positions=xyz,normals=normals,uv=vertices[:,6:8]*[1,-1],indices=indices,material=material,visible=visible and active and bool(show)))
        else:raise ValueError(f'Unsupported KN5 node type {kind}: {name}')
        for _ in range(children):node(world,visible and active)
    node(np.eye(4))
    if stream.tell()!=len(stream.getbuffer()):raise ValueError('Unexpected KN5 trailing bytes')
    return textures,materials,meshes

if __name__=='__main__':
    import sys,json
    for arg in sys.argv[1:]:
        t,m,meshes=load(arg)
        print(Path(arg).name, 'textures',[(k,len(v)) for k,v in t.items()])
        print('materials',[(x['name'],x['shader'],x['maps'],{k:v[0] for k,v in x['properties'].items() if k in ['detailUVMultiplier','diffuseMult','useDetail','ksAlphaRef']}) for x in m])
        print('meshes',[(x['name'],len(x['positions']),len(x['indices'])//3,x['positions'].min(axis=0).round(2).tolist(),x['positions'].max(axis=0).round(2).tolist(),x['visible']) for x in meshes])
