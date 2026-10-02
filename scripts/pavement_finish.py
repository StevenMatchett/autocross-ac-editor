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
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FINISH = '2026-east-video-v2'
GRAIN = Path(__file__).resolve().parent / 'assets/2026-east-pavement.jpg'


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


def patch_existing_glb(path: Path) -> None:
    data = gzip.decompress(path.read_bytes())
    json_length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + json_length])
    previous_finish = gltf.get('extras', {}).get('pavementFinish')
    if previous_finish == FINISH:
        print('Pavement finish already applied')
        return
    if previous_finish not in (None, '2026-east-video-v1'):
        raise ValueError('Unknown pavement finish: ' + previous_finish)
    binary = data[28 + json_length:]
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
