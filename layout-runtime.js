// Compatibility shim: the home layout runtime now lives in layout/ (see layout/index.js).
// The layout editor (layout-editor-inner.js) still imports this path, so keep it.
export * from './layout/index.js';
