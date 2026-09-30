"""Binary validation failures and triangle splitting regression tests (no Blender)."""
import io
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/track-build'))
from direct_kn5 import Writer, write_material, write_mesh, split_triangles
from validate_track import read_kn5, identity, expected_markers, pavement_index, pavement_height

class TrackBuildTests(unittest.TestCase):
    def binary(self, texture='diffuse.png',material=0,indices=(0,1,2),count=None):
        stream=io.BytesIO(); stream.write(b'sc6969'); w=Writer(stream)
        w.pack('II',5,1); w.pack('I',1); w.string('diffuse.png'); data=b'\x89PNG\r\n\x1a\nfixture'; w.pack('I',len(data));stream.write(data)
        w.pack('I',1); write_material(w,dict(name='fixture',texture=texture,blend=0,alpha=0,properties={'ksDiffuse':.4}))
        w.node('root',1,identity())
        v=[(0,0,0,0,1,0,0,0,1,0,0),(0,0,10,0,1,0,0,1,1,0,0),(10,0,0,0,1,0,1,0,1,0,0)]
        write_mesh(w,'1PROAD',material,v,indices,False)
        return stream.getvalue()
    def read(self,data):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'test.kn5';path.write_bytes(data);return read_kn5(path)
    def test_complete_reader_and_pavement(self):
        textures,materials,meshes,nodes=self.read(self.binary())
        self.assertEqual(materials[0]['maps']['txDiffuse'],'diffuse.png')
        cells,faces,down=pavement_index(meshes)
        self.assertEqual((faces,down),(1,0));self.assertEqual(pavement_height(cells,2,2),0)
        self.assertIsNone(pavement_height(cells,20,20))
    def test_corrupt_references_and_binary_fail(self):
        for data,message in [(self.binary(texture='absent.png'),'Missing embedded'),(self.binary(material=5),'material ID'),(self.binary(indices=(0,1,9)),'mesh index'),(self.binary()+b'x','trailing'),(self.binary()[:-1],'Truncated')]:
            with self.subTest(message=message),self.assertRaisesRegex(ValueError,message):self.read(data)
    def test_downward_physical_pavement_fails(self):
        _,_,meshes,_=self.read(self.binary(indices=(0,2,1)))
        with self.assertRaisesRegex(ValueError,'downward'):pavement_index(meshes)
    def test_complete_triangle_splitting(self):
        triangles=[((i,),(i+1,),(i+2,)) for i in range(0,30,3)]
        parts=list(split_triangles(triangles,limit=8))
        self.assertEqual(sum(len(idx) for vertices,idx in parts),30)
        for vertices,idx in parts:
            self.assertLessEqual(len(vertices),8);self.assertEqual(len(idx)%3,0);self.assertLess(max(idx),len(vertices))
    def test_marker_headings_use_local_y_up_z_forward(self):
        for angle in [0,90,180,270,37]:
            layout={'items':[dict(id='s',kind='stage',x=2,z=3,angle=angle)]}
            position,up,forward=expected_markers(layout,{'s':.2})['AC_PIT_0']
            self.assertEqual(position,(2,1.2,3));self.assertEqual(up,(0,1,0))
            import math
            self.assertAlmostEqual(forward[0],math.sin(math.radians(angle)))
            self.assertAlmostEqual(forward[2],-math.cos(math.radians(angle)))
if __name__=='__main__':unittest.main()
