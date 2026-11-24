// editor/undo.js: snapshot history of the whole layout doc (both views). Pure; the scene decides when to push.
export function createHistory(limit) {
  const max = limit || 100;
  let past = [], future = [];
  return {
    push(json) { if (past.length && past[past.length - 1] === json) return; past.push(json); if (past.length > max) past.shift(); future = []; },
    undo(currentJson) { if (!past.length) return null; future.push(currentJson); return past.pop(); },
    redo(currentJson) { if (!future.length) return null; past.push(currentJson); return future.pop(); },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; }
  };
}
