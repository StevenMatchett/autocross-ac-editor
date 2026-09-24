# Padwork

A browser-based autocross course editor for laying out a flat concrete pad site and preparing Assetto Corsa track source files.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:5173. `npm run build` type-checks and builds the production app; `npm run preview` serves that build.

## Editor

- Configurable rectangle of **25 × 25-foot (7.62 × 7.62 m)** concrete pads, defaulting to 24 × 16 pads (600 × 400 ft). This is a Nationals-style base, not a surveyed replica of the actual venue.
- Place upright or sideways pointer cones; drag existing objects directly with any drawing tool, edit coordinates, and rotate staging/start/finish markers. Staging is the car spawn; the start line begins timing. Gate arrows indicate driving direction; 0° points north, 90° east.
- Exact **18-inch (0.4572 m)** cone height and an assumed 0.28 m square base. Small locator rings keep cones visible in the plan view without changing exported dimensions.
- Snap off, 1 ft, 5 ft, or 25 ft; toggle pad lines; zoom with the wheel; pan with Space + drag or the hand tool; fit the site.
- Undo/redo up to 100 edits, including loading the example and clearing the course.
- Browser-local autosave plus downloadable/reopenable JSON layouts. Keep JSON backups: browser storage is local to the browser and origin.
- Orbitable Three.js preview with full-scale cone geometry and flat pad grid. Select a cone before opening the preview to inspect it close up.
- Orange cone bodies and bases with individually seeded fading and rubber scuffs. Wear stays consistent across moves and saves; export includes each cone’s PNG texture for Blender and ksEditor.

Shortcuts: V select, C cone, P pointer cone, G staging, S start, F finish, H pan, R rotate 15°, Delete remove, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo. Editing is primarily designed for a desktop pointer and keyboard.

## Nationals example

**Load example** recreates the supplied 2026 Nationals East course with 217 upright cones, 84 pointer cones, plus separate staging and start markers. Cones 138 and 139 set the exact 75-ft scale; cone 102 anchors a four-way grid intersection. The site is 975 × 1400 ft. Numbers, words, route lines, and the finish marker are omitted; add a finish before exporting. The course and grid preserve the PDF orientation without rotation. Other positions are traced from the PDF and are approximate. See [calibration notes](data/README.md).

## Assetto Corsa export

Place staging, start, and finish, then choose **Export track**. The ZIP includes:

- `layout.json`: versioned editor data; all positions are meters, angles are degrees.
- `build_track.py`: standalone Blender scene/FBX generator, including concrete geometry, visual joints, orange upright and pointer cones with unique rubber-wear textures, A-to-B timing gates, pit and hotlap spawn markers.
- A track folder with `models.ini`, `data/surfaces.ini`, and `ui/ui_track.json`.
- `README.txt`: instructions and limitations.

Extract the ZIP, run `blender --background --python build_track.py` in that directory, open the generated FBX in the Assetto Corsa SDK's **ksEditor**, configure shaders/materials, and export the KN5 into the included track folder. Copy the track folder into the game's `content/tracks` folder and verify scale, orientation, collision, spawning, and timing in-game.

**This is a source export, not a one-click installable game track.** Blender, ksEditor, and Assetto Corsa are not installed in the development environment, so the generated pipeline has not been tested in those applications. Upright and pointer cones export as fixed collision meshes (`1WALL_cone_*` / `1WALL_pointer_*`) using their actual geometry. They are intended to block the car instead of moving when hit. Actual stopping, rebound, or climbing over low geometry must be verified in-game; no scripted speed reset or cone penalty logic is implemented. Preserve the `1WALL_` mesh names in ksEditor. AI lines, game preview images, and KN5 compilation are not included. The generator clears the current Blender scene; run it in a fresh session.

Track object conventions follow the [track creation guide](https://assettocorsamods.net/threads/build-your-first-track-basic-guide.12/). FBX importer compatibility and material configuration require checking against the installed SDK version.

## Verification

```sh
npm test
npm run build
# With npm run dev running and Chromium installed:
node tests/browser.mjs
```

The browser smoke test uses `/usr/bin/chromium`, verifies editing/persistence/export/3D preview, and writes screenshots under `/tmp/`. The unit tests cover real-world dimensions, layout validation and round-tripping, and ZIP contents.

Pointer cones point along their heading (0° north, 90° east) and rest on their base edge and tip in the 3D preview and Blender export. Rotate with R or enter a heading in the selected object’s properties.

## Implementation

TypeScript + Vite, Canvas 2D for the editor, Three.js for the on-demand preview, fflate for ZIP generation. There is no backend. The interface uses system fonts and a compact toolbar with contextual object properties.

- `src/cone-material.ts`: deterministic cone appearance and portable PNG textures.
- `src/model.ts`: units, schema validation, example layout.
- `src/main.ts`: editor state, interactions, rendering and preview.
- `src/export.ts`: Blender generator and Assetto Corsa source bundle.
- `src/style.css`: application styling and responsive layout.

The Nationals staging point sits midway between cones 101 and 102, facing the lane between 103 and 104. Exported pit and hotlap spawns use staging; the start timing line remains at its original PDF position.
