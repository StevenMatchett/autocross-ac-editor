"""Apply the 2026 East apron finish to the pinned Lincoln road image.

The aerial image supplies the site geometry and slab detail. The generated
concrete grain in assets/2026-east-pavement.jpg is a restrained color/texture
reference informed by https://www.youtube.com/watch?v=eUiUFwDX2AI.

Run this file to update an existing public/venue/lincoln.glb.gz. The KN5
importer also calls refine_pavement() when rebuilding the venue from source.
Requires NumPy and Pillow, as does the KN5 importer.
"""
from pathlib import Path
from io import BytesIO
import gzip
import json
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
FINISH = '2026-east-concrete-v4'
GRAIN = Path(__file__).resolve().parent / 'assets/2026-east-pavement.jpg'
CONCRETE_REPEAT_METERS = 64.0


def apron_mask(size):
    width, height = size
    mask = Image.new('L', size)
    # These points follow the east apron in the original RoadBackground atlas.
    # The feather keeps the finish from making a line across adjacent concrete.
    apron = [(850, 0), (1190, 0), (1190, 1018), (670, 1018),
             (670, 708), (830, 708), (830, 536), (850, 536)]
    ImageDraw.Draw(mask).polygon(
        [(round(x * width / 1600), round(y * height / 1600)) for x, y in apron],
        fill=255)
    return mask.filter(ImageFilter.GaussianBlur(48))


def encode(image):
    output = BytesIO()
    Image.fromarray(image).save(output, format='JPEG', quality=90, subsampling=0)
    return output.getvalue()


def deepen_pavement(raw: bytes) -> bytes:
    source = Image.open(BytesIO(raw)).convert('RGB')
    if source.size != (4096, 4096):
        raise ValueError('Expected the pinned 4096-square Lincoln road image')
    original = np.asarray(source, dtype=np.float32)
    sharpened = np.asarray(source.filter(ImageFilter.UnsharpMask(radius=4, percent=110, threshold=3)), dtype=np.float32)
    red, green = original[:, :, 0], original[:, :, 1]
    coverage = np.asarray(apron_mask(source.size), dtype=np.float32) / 255
    coverage *= np.clip((red - green + 16) / 16, 0, 1)
    coverage *= np.clip((red - 75) / 20, 0, 1)
    result = np.uint8(np.clip(original * (1 - coverage[:, :, None])
                              + sharpened * .84 * coverage[:, :, None], 0, 255))
    return encode(result)


def refine_pavement(raw: bytes) -> bytes:
    source = Image.open(BytesIO(raw)).convert('RGB')
    if source.size != (4096, 4096):
        raise ValueError('Expected the pinned 4096-square Lincoln road image')
    width, height = source.size
    mask = apron_mask(source.size)

    original = np.asarray(source, dtype=np.float32)
    grain = np.asarray(Image.open(GRAIN).convert('RGB').resize((1024, 1024)), dtype=np.float32)
    grain = np.tile(grain, (4, 4, 1))
    red, green, blue = original[:, :, 0], original[:, :, 1], original[:, :, 2]
    # Protect green areas and the dark site features along the apron edge.
    concrete = np.clip((red - green + 12) / 20, 0, 1)
    concrete *= np.clip((green - blue + 12) / 20, 0, 1)
    concrete *= np.clip((red - 95) / 30, 0, 1)
    strength = np.asarray(mask, dtype=np.float32) / 255 * concrete
    finished = original * .72 + grain * .28 - 30
    finished[:, :, 0] -= 7
    finished[:, :, 2] += 8
    result = np.uint8(np.clip(original * (1 - strength[:, :, None])
                              + finished * strength[:, :, None], 0, 255))
    return deepen_pavement(encode(result))


def _append_blob(gltf, binary, data):
    binary.extend(b'\0' * (-len(binary) % 4))
    offset = len(binary)
    binary.extend(data)
    index = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(data)})
    return index


def _accessor(gltf, binary, index, dtype, components):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    count = accessor['count'] * components
    return np.frombuffer(binary, dtype=dtype, count=count, offset=offset).reshape(-1, components)


def _new_accessor(gltf, binary, array, kind, component_type):
    array = np.ascontiguousarray(array)
    view = _append_blob(gltf, binary, array.tobytes())
    accessor = {'bufferView': view, 'componentType': component_type,
                'count': len(array), 'type': kind}
    if kind == 'VEC3':
        accessor['min'] = array.min(axis=0).tolist()
        accessor['max'] = array.max(axis=0).tolist()
    index = len(gltf['accessors'])
    gltf['accessors'].append(accessor)
    return index


def add_apron_surface(gltf, binary):
    """Add one visual-only road layer with more texture pixels per meter."""
    road_mesh = next(mesh for mesh in gltf['meshes'] if mesh['name'] == '1PROAD0')
    primitive = road_mesh['primitives'][0]
    attributes = primitive['attributes']
    positions = _accessor(gltf, binary, attributes['POSITION'], '<f4', 3).copy()
    normals = _accessor(gltf, binary, attributes['NORMAL'], '<f4', 3).copy()
    source_uv = _accessor(gltf, binary, attributes['TEXCOORD_0'], '<f4', 2).copy()
    triangles = _accessor(gltf, binary, primitive['indices'], '<u2', 1).reshape(-1, 3).copy()
    road_material = gltf['materials'][primitive['material']]
    source_texture = gltf['textures'][road_material['pbrMetallicRoughness']['baseColorTexture']['index']]
    source_view = gltf['bufferViews'][gltf['images'][source_texture['source']]['bufferView']]
    start, length = source_view['byteOffset'], source_view['byteLength']
    aerial = Image.open(BytesIO(binary[start:start + length])).convert('RGB')
    if aerial.size != (4096, 4096):
        raise ValueError('Expected the pinned Lincoln road atlas')

    uv_pixels = np.mod(source_uv, 1) * 4096
    uv_pixels = np.clip(uv_pixels.astype(np.int32), 0, 4095)
    mask = np.asarray(apron_mask(aerial.size))
    vertex_inside = mask[uv_pixels[:, 1], uv_pixels[:, 0]] > 220
    selected = triangles[np.all(vertex_inside[triangles], axis=1)]
    if not 25000 <= len(selected) <= 40000:
        raise ValueError('East apron selection changed unexpectedly')
    used, remapped = np.unique(selected, return_inverse=True)
    remapped = remapped.astype('<u2').reshape(-1, 3)

    # One 64 m patch repeats over the apron. Four mirrored copies make the
    # edges seamless; each source pixel now represents about 1.5 cm on track.
    size = 4096
    tile = Image.open(GRAIN).convert('RGB').resize((1024, 1024))
    grain = Image.new('RGB', (size, size))
    for row in range(4):
        for col in range(4):
            patch = ImageOps.mirror(tile) if col % 2 else tile
            patch = ImageOps.flip(patch) if row % 2 else patch
            grain.paste(patch, (col * 1024, row * 1024))
    texture = ImageEnhance.Brightness(grain).enhance(.88)
    output = BytesIO()
    texture.save(output, format='JPEG', quality=90, subsampling=0)
    image_view = _append_blob(gltf, binary, output.getvalue())
    image_index = len(gltf['images'])
    gltf['images'].append({'bufferView': image_view, 'mimeType': 'image/jpeg'})
    texture_index = len(gltf['textures'])
    gltf['textures'].append({'sampler': 0, 'source': image_index})
    material_index = len(gltf['materials'])
    gltf['materials'].append({'name': 'EastApronConcrete', 'pbrMetallicRoughness': {
        'baseColorFactor': [1, 1, 1, 1], 'baseColorTexture': {'index': texture_index},
        'metallicFactor': 0, 'roughnessFactor': 1}})

    overlay_positions = positions[used].copy()
    overlay_positions[:, 1] += .012
    overlay_uv = np.column_stack((positions[used, 0] / CONCRETE_REPEAT_METERS,
                                  positions[used, 2] / CONCRETE_REPEAT_METERS)).astype('<f4')
    new_attributes = {
        'POSITION': _new_accessor(gltf, binary, overlay_positions.astype('<f4'), 'VEC3', 5126),
        'NORMAL': _new_accessor(gltf, binary, normals[used].astype('<f4'), 'VEC3', 5126),
        'TEXCOORD_0': _new_accessor(gltf, binary, overlay_uv, 'VEC2', 5126),
    }
    index = _new_accessor(gltf, binary, remapped.reshape(-1), 'SCALAR', 5123)
    mesh_index = len(gltf['meshes'])
    gltf['meshes'].append({'name': 'EastApronConcrete', 'primitives': [{
        'attributes': new_attributes, 'indices': index, 'material': material_index}]})
    node_index = len(gltf['nodes'])
    gltf['nodes'].append({'name': 'EastApronConcrete', 'mesh': mesh_index})
    gltf['scenes'][0]['nodes'].append(node_index)
    binary.extend(b'\0' * (-len(binary) % 4))
    print('Added concrete surface over', len(selected), 'apron triangles')


def patch_existing_glb(path: Path) -> None:
    data = gzip.decompress(path.read_bytes())
    json_length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    previous_finish = gltf.get('extras', {}).get('pavementFinish')
    if previous_finish == FINISH:
        print('Pavement finish already applied')
        return
    if previous_finish not in (None, '2026-east-video-v1', '2026-east-video-v2'):
        raise ValueError('Unknown pavement finish: ' + previous_finish)
    binary = data[28 + json_length:]
    if previous_finish != '2026-east-video-v2':
        material = next(m for m in gltf['materials'] if m['name'] == 'RoadBackground')
        texture = gltf['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
        view = gltf['bufferViews'][gltf['images'][texture['source']]['bufferView']]
        start, length = view['byteOffset'], view['byteLength']
        next_start = min((v['byteOffset'] for v in gltf['bufferViews']
                          if v.get('byteOffset', 0) >= start + length), default=len(binary))
        source_image = binary[start:start + length]
        replacement = (deepen_pavement(source_image) if previous_finish
                       else refine_pavement(source_image))
        image_length = len(replacement)
        replacement += b'\0' * (-image_length % 4)
        shift = len(replacement) - (next_start - start)
        binary = binary[:start] + replacement + binary[next_start:]
        view['byteLength'] = image_length
        for other in gltf['bufferViews']:
            if other is not view and other.get('byteOffset', 0) >= next_start:
                other['byteOffset'] += shift
    binary = bytearray(binary)
    add_apron_surface(gltf, binary)
    gltf['buffers'][0]['byteLength'] = len(binary)
    gltf.setdefault('extras', {})['pavementFinish'] = FINISH
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    glb = (struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(binary))
           + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
           + struct.pack('<II', len(binary), 0x004e4942) + binary)
    compressed = gzip.compress(glb, compresslevel=9, mtime=0)
    path.write_bytes(compressed)
    metadata = ROOT / 'src/assets/venue.json'
    info = json.loads(metadata.read_text())
    info['glbBytes'] = len(glb)
    info['downloadBytes'] = len(compressed)
    info['pavementFinish'] = FINISH
    metadata.write_text(json.dumps(info, indent=2) + '\n')
    print('Updated pavement texture:', len(compressed), 'compressed bytes')


if __name__ == '__main__':
    patch_existing_glb(ROOT / 'public/venue/lincoln.glb.gz')
