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
| `lincoln_*mpt.kn5` | Additional shared venue models; contents not yet inspected |

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

## Integration approach

1. Extract reusable upright/pointer templates and their texture for the browser preview and tester. Preserve UVs and normalize height to the editor's exact 0.4572 m requirement.
2. Use the same templates in the Blender export, with matching physical bounds and fixed collision names.
3. Keep shared venue KN5 files separate from newly generated course/timing files for a mod-compatible export. Coordinate alignment needs verification before claiming compatibility; their origin is different from our positive-coordinate editor site.
4. Treat full venue rendering as a separate browser optimization task. The existing compiled venue is much larger than the cone assets, and the actual road geometry has not yet been inspected.

No license file or reuse terms were found in the inspected tree, and GitHub reports `license: null`. The project owner explicitly confirmed permission to redistribute the assets on 2026-09-24. Only the extracted cone templates and orange texture are bundled; the full KN5 download remains in ignored `tmp/`. This confirmation is not a general upstream license grant.

## Implemented cone integration

`src/assets/nats-cone.json` contains separate 36-vertex / 44-triangle upright and pointer templates plus a PNG conversion of the original DDS. `scripts/extract-nats-cone.py` recreates the asset from the pinned 2021 file and verifies its SHA-256 before conversion; it requires Python and Pillow. KN5 parsing follows the documented layout in [kn5-obj-converter](https://github.com/MarvinSt/kn5-obj-converter/blob/main/convert.py); no converter implementation is bundled.

The browser and Blender export share positions, normals, UVs, and texture. The source UVs use a repeated tile, so browser wrapping must remain enabled. Upright height is exactly 0.4572 m; normalized base width is about 0.2914 m. Pointer geometry retains the source tilt and rests on the flat ground with its tip along heading zero. Collision bounds are computed from these templates. Per-cone tint is stable across moves and saves; the Blender material uses a multiply node (ksEditor material settings still need verification).
