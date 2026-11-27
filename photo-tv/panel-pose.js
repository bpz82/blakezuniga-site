/* panel-pose.js (Blake t470u "on desktop the panel needs to stay kinda in one spot like how the amp does")
   Pure world-pose store for the photo-panel lock. Contract: no DOM, no THREE, no I/O, never reads a camera.
   The amp is posed from stored numbers every frame (layout/index.js applyAmp -> applyPose); the panel now works the same way:
   - bakePanelPose(lock) -> { p:[x,y,z], q:[x,y,z,w], s:[x,y,z] }   (copy of the lock's world pose; the lock lives in the scene root)
   - applyPanelWorldPose(lock, pose)                              (sets the lock from the stored pose only)
   - steadyPanel(state, lock, liveCam, refReady, bake)
       before the reference home camera is ready: does nothing to the pose and keeps the lock hidden (no live-camera fallback);
       first ready call: bake() poses the lock from the reference camera, the result is stored in state.pose;
       every later call: applies state.pose. liveCam is accepted for the hook signature but never read. */
export function bakePanelPose(lock) {
  const p = lock.position, q = lock.quaternion, s = lock.scale;
  return { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w], s: [s.x, s.y, s.z] };
}
export function applyPanelWorldPose(lock, pose) {
  if (!lock || !pose) return false;
  const p = lock.position, q = lock.quaternion, s = lock.scale;
  if (p.x === pose.p[0] && p.y === pose.p[1] && p.z === pose.p[2] && q.x === pose.q[0] && q.y === pose.q[1] && q.z === pose.q[2] &&
      q.w === pose.q[3] && s.x === pose.s[0] && s.y === pose.s[1] && s.z === pose.s[2]) return true;   // already there: no work
  lock.position.set(pose.p[0], pose.p[1], pose.p[2]);
  lock.quaternion.set(pose.q[0], pose.q[1], pose.q[2], pose.q[3]);
  lock.scale.set(pose.s[0], pose.s[1], pose.s[2]);
  if (lock.updateMatrixWorld) lock.updateMatrixWorld(true);
  return true;
}
// eslint-disable-next-line no-unused-vars
export function steadyPanel(state, lock, liveCam, refReady, bake) {
  if (state.pose) { applyPanelWorldPose(lock, state.pose); return 'applied'; }
  if (!refReady) { if (lock.visible !== false) lock.visible = false; return 'wait'; }
  bake();
  state.pose = bakePanelPose(lock);
  applyPanelWorldPose(lock, state.pose);
  lock.visible = true;
  return 'baked';
}
