# Nationals mod asset reference

Source: https://github.com/schmerchak/nats-mod

Inspected commit: `1742a96633537278dfc4f647a984e45fed8de647`.

## Confirmed structure

The repository supplies compiled KN5 files through Git LFS, rather than Blender/FBX source assets. `models_2021_east.ini` combines the year's course and timing with shared venue models. The 2021 UI credits Mike Ferchak.

| Asset | Role / size |
| --- | --- |
| `lincoln_2021_course.kn5` | Both courses' cone meshes and embedded textures; 2.19 MB |
| `lincoln_2021_east_timing.kn5` | East timing/spawn model, placed at `143,0,-249` |
| `lincoln_road.kn5` | Road model; 96.40 MB |
| `lincoln_grass.kn5` | Grass model; 135.94 MB |
| `lincoln_trees.kn5` | Trees; 19.95 MB, placed at `143,0,-249` |
| `lincoln_scenery_objects.kn5` | Scenery; 14.11 MB |
| `lincoln_*mpt.kn5` | Surrounding photogrammetry and buildings |

All KN5 files together total approximately 322 MB. Do not infer asset contents from a successful ordinary clone: without Git LFS those files are small pointer documents. The actual 2021 course binary was downloaded and parsed locally to verify its contents.

## Verified cone assets

The 2021 course uses KN5 version 6 with six static mesh groups:

- `6WALL_cone_east_pointer`
- `5WALL_cone_east_upright_green`
- `4WALL_cone_east_upright`
- `3WALL_cone_center_green`
- `2WALL_cone_west_pointer`
- `1WALL_cone_west_upright`

Materials use `ksPerPixel` with embedded `ConePaintTexture.dds` and `ConeGreenTexture.dds`. Cones are combined into course-sized meshes; they are not individually addressable scene nodes. Reusing them as placeable objects requires extracting one cone's geometry and UVs, removing its baked position/orientation, and retaining its texture.

The first upright west cone's 36 vertices span approximately 0.292 × 0.458 × 0.292 m. This is close to the editor's 18-inch height, but its base is wider than our assumed 0.28 m base. Imported geometry and collision bounds must agree. The original mesh elevations also vary across the course; retain the editor's flat-ground requirement when making placeable templates.

No license file or reuse terms were found in the inspected tree, and GitHub reports `license: null`. The project owner explicitly confirmed permission to redistribute the assets on 2026-09-24. Converted cone and venue assets are bundled; the original KN5 downloads remain in ignored `tmp/`. This confirmation is not a general upstream license grant.

## Implemented cone integration

`src/assets/nats-cone.json` contains separate 36-vertex / 44-triangle upright and pointer templates plus a PNG conversion of the original DDS. `scripts/extract-nats-cone.py` recreates the asset from the pinned 2021 file and verifies its SHA-256 before conversion; it requires Python and Pillow. KN5 parsing follows the documented layout in [kn5-obj-converter](https://github.com/MarvinSt/kn5-obj-converter/blob/main/convert.py); no converter implementation is bundled.

The browser and Blender export share positions, normals, UVs, and texture. The source UVs use a repeated tile, so browser wrapping must remain enabled. Upright height is exactly 0.4572 m; normalized base width is about 0.2914 m. Pointer geometry retains the source tilt and rests on the flat ground with its tip along heading zero. Collision bounds are computed from these templates. Per-cone tint is stable across moves and saves; the Blender material uses a multiply node (ksEditor material settings still need verification).

## Implemented venue integration

All nine shared models from `models_2021_east.ini` are included in `public/venue/lincoln.glb.gz`; the original year's course and timing files are excluded. The tree model receives the INI's `143,0,-249` placement. Node matrices are applied before conversion. All geometry then receives the same translation: editor X = source X + 22.86 m; editor Z = source Z + 518.16 m. Height, orientation, and scale are retained. This is a translated converted venue, not a drop-in overlay for an existing original KN5 installation.

The editor uses an 84 × 74 pad bounding rectangle around the main lot. The top-down image is rendered from that same model, with north toward decreasing Z. The grid is an optional spacing guide and does not assert joint alignment. Loading the 2026 example while on the venue translates its objects by +320.04 m X and +68.58 m Z (42 and 9 pads). No scaling or rotation is applied; the 75-foot calibration and relative positions are preserved. This is an approximate east-apron placement, not surveyed joint alignment. The app always uses Lincoln. The original flat example coordinates remain in the source fixture for calibration; loading translates a fresh copy. Legacy flat saved layouts are migrated with a single translation (the example offset for Nationals objects, otherwise centered in whole-pad increments); files too large for the venue are rejected instead of clipped.

`road.bin.gz` preserves the road mesh triangles in editor coordinates. The runtime uses spatially indexed barycentric height queries for object placement and car height. Car footprint samples must remain on that source mesh. This models the source driving surface, not image-based pavement/grass classification. Scenery collisions and suspension physics are not simulated.

The venue retains 254 meshes and 629,822 triangles. The packed browser download is about 41 MB. Diffuse imagery is resized to at most 4096 pixels for the main aerial image and 1024 for other textures; ksMultilayer detail shaders are reduced to diffuse maps, and ksTree foliage uses unlit alpha-cutout materials. Texture anisotropy improves ground-level viewing. These conversions do not claim pixel-identical Assetto Corsa rendering.

Regenerate using Python with NumPy and Pillow:

```sh
python scripts/import-nats-venue.py /path/to/actual/kn5/files
# With npm run dev and Chromium available:
node scripts/capture-venue-map.mjs
```

The converter verifies every input hash against `src/assets/venue.json`. The original sources are available through Git LFS at the pinned commit. The export bundles the decompressed GLB and per-object surface heights; Blender imports the venue, extracts images, and creates course objects in the same coordinate frame. Surface keys retain PROAD and GRASS. Blender/ksEditor/game execution remains unverified.
