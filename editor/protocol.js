// editor/protocol.js: postMessage contract between the editor chrome (layout-editor.html, editor/ui.js) and the scene
// iframe (index.html?edit=1 -> editor/scene.js). Both sides import these names; see README.md for payloads.
export const T = {
  // chrome -> scene
  select: 'le:select',     // { id | null }
  set: 'le:set',           // { id, props }            merge props into the active view's item (undo-coalesced)
  begin: 'le:begin',       // {}                        start an undo step now (optional; le:set coalesces bursts)
  undo: 'le:undo', redo: 'le:redo',   // {}
  resetItem: 'le:reset-item',         // { id }         back to layout.json's value for this item (or session start)
  reset: 'le:reset',       // { viewport }              clear this view back to automatic placement (reloads the iframe)
  snap: 'le:snap',         // { on }
  ping: 'le:ping',         // {}                        ask for a le:state
  // scene -> chrome
  state: 'le:state',       // { doc, viewport, selected, values, ready, vw, vh, canUndo, canRedo, snap, boot? }
  ready: 'le:ready'        // { viewport, vw, vh }
};
export const isEditorMsg = (m) => !!m && typeof m === 'object' && typeof m.type === 'string' && m.type.indexOf('le:') === 0;
