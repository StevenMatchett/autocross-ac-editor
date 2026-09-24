# 2026 Nationals East example

Source: the user's `2026 - Nats - East Course - Final.pdf`, a one-page raster map titled **World of Conecraft**, East Course, by **Karen Babb**. Its embedded image is 3817 × 6581 pixels. The PDF itself is not bundled.

The numbered point symbols were visually matched to cone IDs and their centers extracted at the original image resolution. Triangle symbols were traced as pointer cones. The trace includes 217 upright cones and 84 pointers. Pointer position and angle remain diagram-derived estimates; the source is not a survey.

The user's calibration is authoritative:

- Cone 138 to cone 139 is exactly 75 feet, measured center to center. These cones are **not** four-way-joint anchors.
- Cone 102 is directly on a four-way concrete joint.
- The grid axes follow the PDF axes; there is no model or camera rotation.

`scripts/build-nationals-example.mjs` uses the 138–139 distance for a uniform scale only. It translates cone 102 onto a grid intersection at (450 ft, 1350 ft). No other cone is moved or snapped to a joint, and the drawing is not stretched. The earlier shared-joint assumption and 2.82° rotation have been removed.

The rectangular site is 39 × 56 pads (975 × 1400 ft), sized to enclose the course with room at the edges. Its boundary is inferred, not the actual venue perimeter. Grid origin is set by cone 102; other real-world pavement joints cannot be verified from the illustration alone.

Cones, staging, and the start marker are included in the example. Staging is centered between cones 101 and 102 and faces the entry lane between 103 and 104; the start remains the timing line. Cone numbers are internal trace identifiers, not visible map labels. Text, sector markers, dashed route lines, parking areas, and the finish marker are omitted as requested. The cones around the PDF's finish line remain included. Add a finish marker before exporting to Assetto Corsa.

Rebuild the bundled layout:

```sh
node scripts/build-nationals-example.mjs
```

- `nationals-east-2026-trace.json`: original-image coordinates, pointer directions, and source attribution.
- `nationals-east-2026-calibration.json`: derived scale and grid placement.
- `../src/examples/nationals-east-2026.json`: editable layout consumed by Load example.

The scale and grid reference are exact in the editor. The remaining placements reproduce a raster diagram and should not be presented as surveyed cone locations.
