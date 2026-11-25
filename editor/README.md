# Layout editor (editor/)

Entry: `../layout-editor.html` (chrome) which embeds `../index.html?edit=1&view=desktop|phone` in an iframe.
Three isolated apps share the repo: `layout/` (runtime + doc), `photo-tv/`, `editor/`.

## Files
| file | role |
| --- | --- |
| `ui.js`, `editor.css` | chrome: toolbar, chips, selected-object panel (slider + number per field), Copy/Download. Owns the iframe. Never touches the scene or localStorage. |
| `protocol.js` | postMessage type names (`le:*`) shared by both sides |
| `schema.js` | which layout.json keys each item exposes, ranges, snap steps |
| `scene.js` | runs inside the iframe (loaded via `../layout-editor-inner.js` shim, only with `?edit=1`): overlay, gestures, hit-test, undo, messages |
| `outlines.js` | on-screen shapes per item (see below) |
| `geometry.js` | pure 2D helpers (hull, point-in-polygon, area, ...) |
| `undo.js` | snapshot history of the whole doc |

## Iframe protocol (postMessage, `*` origin, same-origin pages)
chrome -> scene: `le:select {id|null}`, `le:set {id, props}`, `le:begin`, `le:undo`, `le:redo`, `le:reset-item {id}`, `le:reset {viewport}` (reloads iframe), `le:snap {on}`, `le:ping`.
scene -> chrome: `le:state {doc, viewport, selected, values, ready, vw, vh, canUndo, canRedo, snap, boot?}`, `le:ready {viewport, vw, vh}`.
The view switch (Desktop/Phone) resizes the iframe; no reload after first load. The scene picks the view by `innerWidth/innerHeight` (layout/doc.js).
Test hooks: `iframe.contentWindow.__layoutEditor.tools` = `{outlineOf, hitsAt, pick, undo, redo, select, values}`; chrome exposes `window.__editorChrome`.

## Data
Schema: `layout.json` `{version:1, desktop:{guitar,amp,panel,title,neon,tiles,explore,camera}, phone:{...}}`; keys per item in `schema.js` (unchanged contract).
localStorage key `bz-home-layout` holds the same format; with `?edit=1` it overrides layout.json (layout/doc.js). Copy JSON / Download serialise the in-memory doc. There is no Publish button; layout.json is only changed by a human applying the exported file.

## Outlines
- guitar, amp, title: convex hull of all projected vertices of visible meshes (skips invisible/colorless materials and transparent no-depth-write blobs such as shadows/halos). Large clouds are column-reduced to ~1 px accuracy first.
- panel: the real projected screen quad on the `photo-panel` child (includes lock scale, rz tilt, ry turn).
- neon: projected quad of the glyph ink box (alpha scan of the core layer's canvas).
- tiles: union of `.zg-tile` rects; explore: `#zg-explore` rect.
Hit-test = point-in-polygon (+12 px edge tolerance for touch). Selected chip keeps priority unless another hit shape is < 0.85x its area; otherwise smallest shape wins. Handles sit on the shape's extreme vertices; rotate handle above the top vertex (guitar/amp: `ry`, panel/title: `rz`).

## Extend
Add an item: outline in `outlines.js` (`outlineOf` + `ITEM_IDS`), seed in `scene.js ensureItem`, move/scale branches in `onMove`/`applyScale`, fields in `schema.js`, chip comes from `ORDER`.
Photos tab: `../layout/photo-manager.{js,css}` hooks only `#btn-mode-layout`, `#btn-mode-photos`, `#photo-manager`, `.layout-only`, `.photos-only`, `#stage-wrap`. Keep those.

## Phone / touch (editor-v3)
- Chrome is responsive: `body.compact` (set by `ui.js` for `(max-width:700px), (max-height:500px)`) moves the tools, view switch, chips and sliders into a bottom sheet. A 52 px tab bar (Layout / Photos / JSON) is a flex sibling under the stage, so a collapsed sheet never covers it; an expanded sheet opens upward over the stage and the same tab collapses it. Desktop keeps the toolbar header and the inspector under the stage. `placeChrome()` re-parents the nodes (no duplicate IDs). Compact starts in the Phone view.
- JSON tab: read-only, selectable textarea of the current doc plus Copy JSON / Download / Select all.
- Copy JSON (iOS-safe): everything that needs the user gesture runs synchronously in the click (`navigator.clipboard.writeText` started without await, plus textarea `execCommand('copy')`). If both fail the JSON tab opens with the text selected. `window.__editorChrome.lastCopied` is set synchronously.
- Gestures (pointer events, `touch-action:none` on overlay and stage): one finger drags (Explore/tiles write x/y, panel/title cx/cy, 3D items x/y/z); corner handle resizes (panel w/h together, items `s`); two fingers pinch-scale and twist-rotate (`rz` for panel/title, `ry` for guitar/amp, 0.1 rad dead zone); rotate handle as before. Handle hits win over shape hits.
- Handles are 44 screen px: the iframe computes its on-screen scale (`frameElement` rect) and sets `--le-k = 1/scale`; box size, edge clamp (`max(18, 22*k)` px) and touch hit tolerance all use it, so a handle is fully on-screen and hittable at any stage scale.
