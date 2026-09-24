# Editor design

Use the installed Anthropic frontend-design skill for frontend work: `~/.codex/skills/frontend-design/SKILL.md`.

The course is the primary content. Controls should earn their space by supporting an editing action.

- Palette: paper #ffffff, chrome #f5f6f7, concrete #d9dcdd, graphite #27313a, muted #66727d, selection blue #245dc1. Orange is reserved for cones.
- Type: system sans-serif for controls and labels; tabular numbers for dimensions and coordinates. No display headlines or decorative labels.
- Layout: left-aligned course name and file actions in the header; 220 px site/selection panel; horizontal drawing tools over the canvas; compact status strip below.
- Copy: action labels, units, and necessary feedback only. Export limitations belong in the export dialog. Shortcuts belong in help and tooltips.

```
[Padwork | Course name                         Open Save Export]
[Site settings ][Select Cone Start Finish Pan | Undo Redo | 3D]
[600 × 400 ft  ][                                               ]
[Pad counts   ][                   Course                      ]
[Snap / Grid  ][                                               ]
[Selection*   ][                                               ]
[Example / New][Coordinates                Cones / Start / Finish]
```

Review: removed the proposed overview panel because it repeats the map; placed counts in the status strip. Removed a permanent empty-state card because it obscures the working surface. Retained short, contextual tool guidance. Overall site dimensions precede the 25-foot pad detail to prevent confusion.
