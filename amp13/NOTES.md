# amp6 notes (WEBSITE, Nov 16 2026, 4:15-5:40 PM ET)

Blake t159u (dark; knobs not 3D; walk on the amp incl. sides with the view kept right; Explore Amp pop-up at the neck end with a fly-over; fly-down on Explore Guitar), t160u (royal blue pilot light), t162u (use Opus). Copied from amp5-badge (untouched); combined preview site1-amp6 copied from site1-amp5. Live site1/ and the blakezuniga-site repo were not touched.

## Who wrote what
All code by Claude OPUS via `CLAUDE_MODEL=opus ai.sh claude` (Blake t162u), saved byte-for-byte with opus/extract.py (FILE blocks). Briefs and replies in amp6/opus/. Grok wrote no app or test code (only the extractor, screenshot/probe scripts and these notes).
- Call 1 (16:26, ok): amp.js — brightness light rig, 3D chicken-head knobs, royal-blue swappable pilot (makePilotLight / handle.setPilot), useDriver hook, ampWalkBox.
- Call 2 (16:25, ok): amp-walk.js (surface walker on top/front/back/left/right with edge roll and camera-up = face normal), amp-hook.js, standalone index.html (fog fix = phone darkness), amp-chrome.js/css (joystick, hint).
- Call 3 (16:36, ok): site1-amp6/build-site1-amp6.py (+amp-transit.css): amp6 hook, placement, Explore Amp pop-up at the neck end, Explore Guitar fly-down.
- Call 4 (16:46, ok): amp.js polish (black knobs, saturated blue pilot, panel not washed out, softer tolex normal).
- Call 5 (16:46, ok): build-site1-amp6-place.py (placement v2; infeasible on both viewports).
- Call 6 (16:57, ok): amp6/amp6-harness.mjs (21 original checks unchanged + new checks).
- Call 7 (17:10, ok): amp.js crowned knob tops; build-site1-amp6-place3.py (v2 if feasible else v1).
- Call 8 (17:18, ok): build-site1-amp6-flyms.py (fly clock hitch-safe + __dbg.flyMs test knob); harness measures mode changes in-page and slows flies for sampling (thresholds unchanged).
- Call 9 (17:26): FAILED — Opus 5-hour limit, resets 9:10 PM ET. It was the desktop placement fix. Stopped there per the rule.
Note: in call 4 Claude says it ran one read-only Bash command (wc/ls) despite the Read-only brief; nothing was changed.

## Tests
`AMP_PORT=8771 node amp6/amp6-harness.mjs` -> test-logs/2026-11-16-amp6.log: 59/60 PASS. Only FAIL: "site1-amp6 desktop: home amp is fully on screen" (amp top cut off above the frame on 1280x800; phone passes). Kept honest; needs the desktop placement fix (Opus after 9:10 PM) or Blake's call on amp size/position.

## Backups (nothing deleted)
amp.js.pre-amp6 (= amp5), amp-opus-pass1.js, amp-opus-pass2.js; site1-amp6/index-pre-amp6.html, index-pre-place-v2.html; *.pre-amp6 for replaced chrome/hook/index files.

# amp5-badge notes (WEBSITE, Nov 16 2026)

Copied from amp4-fable (amp4 left untouched). The ChatGPT job's `amp4-fable/gpt-options/` was not copied and was not written. Original logo-4.png and knob-1.png in gpt-options were read-only (md5s unchanged).

## Glaswerks badge (Blake t153u / t154u)
- Source logo (read-only): `/workspace/zuniga-guitar/proto/guitar5/assets/logo1.png` (md5 `6ff75335f2ce915ac73e082ba575e212`, 2172x724 RGB). Never modified. No writes under `/workspace/zuniga-guitar`.
- Keying is the same as `build_rig.py` lines 73-78 (sample background at [5,5], abs-diff threshold 10, gain 7, 3x3 morphological open, crop to bbox). Script: `tools/make-glaswerks-badge-cutout.py`.
- New full-res cutout: `assets/glaswerks-badge-app.png` (1925x532 RGBA).
- Runtime texture: `assets/badge.png` is a 1536x424 optimized resize of that cutout, so the badge needed no amp.js change (it already loads `badge.png` with `transparent` + `alphaTest`). The amp4 badge is kept as `assets/badge-amp4.png`.

## Zingaro logo + knob caps (Blake's ChatGPT picks)
- Zingaro: cleaned `gpt-options/logo-4.png` (stray fringe/speckles keyed out) into new file `assets/zingaro-logo4-cutout.png` (1746x813 RGBA). The baked script was painted out of a copy of `panel.jpg` (original kept as `panel-amp4.jpg`).
- Knobs: `gpt-options/knob-1.png` with the white inlay extended farther along the pointer, saved as new file `assets/knob-1-inlay-extended.png` (1024x1024 RGBA).
- amp.js updates were written by Claude Sonnet via `ai.sh claude` (session b3a0d249, 145s, ok) and saved exactly (backup: `amp-pre-zingaro-knobs.js`, still byte-identical to amp4). Grok did not write amp.js. Brief/reply in `claude/`.

## Tests and preview
- Local hook: `../site1-amp5/` points at `../amp5-badge/`. Live `site1/` and `site1-amp4/` were not written.
- Harness: `AMP_PORT=8770 node amp5-badge/amp5-harness.mjs` (same 21 checks as amp4-harness, paths only) — 21/21 PASS, log `test-logs/2026-11-16-amp5-badge.log`.
- Preview: https://bpz-guitar-versions.surge.sh/amp5/ — standalone only. Existing `/amp4/` and live `/site1/` stay.
- Shots: `amp5-badge/shots/` and `guitar-explorer/shots/nov16-amp5-badge/` (desk, phone, badge close-up, Zingaro close-up, knob close-ups).

# amp4-fable notes (WEBSITE, Nov 16 2026)

Blake t144u: launch Fable on the latest (ChatGPT amp3) amp and fix it up.

## Stopped mid-job
Fable wrote and I saved `tools/make-textures.py`, then ran it into `assets/`. Fable's second call, for `amp.js` + `index.html` (recessed Fender side handle, phone framing), hit the 5-hour limit before printing any code. Per Blake's standing rule I stopped: I did not write amp.js, did not switch models, did not publish previews, and did not run the 21-test suite.

Limit text: `You've hit your 5-hour limit · resets 11:10am (America/New_York)`
ai-calls.log: `2026-11-16 06:37:48  WEBSITE  claude  361s  fail(1)  502df07d-b52a-4e73-9b1d-3a38ccac5ce4`

## What Fable wrote
- Texture pass: `CLAUDE_MODEL=fable` via ai.sh, 997s, ok, session `05bb913a-7428-4272-a123-fdf4eb685b9d` (6:13–6:29 AM ET). `claude -p` stdout (`fable/reply-textures.txt`) was only the second half of the file (a known last-message-only quirk). The complete script was joined, with no typo patches, from the two assistant messages in the session log (`fable/reply-textures-full.txt`). Saved exactly as `tools/make-textures.py` (md5 `98e52c2af27c6e074b93290c1ac8162b`, 802 lines). Amp3 copy kept as `tools/make-textures-amp3copy.py`.
- Generator run: `python3 tools/make-textures.py --ref ../amp4-fable/ref --out assets-fable-pass1` — exit 0, 585 KB of maps. Those maps were copied into `assets/` (fonts and `tolex-bump.jpg` kept; amp3 maps backed up in `assets-prev-amp3/`).
- Amp.js pass: session `502df07d-b52a-4e73-9b1d-3a38ccac5ce4`. Fable read amp.js, index.html, and the side/handle photos, then returned only the 5-hour limit. No FILE fence, no amp.js or index.html in the session. `amp.js` is still ChatGPT's amp3 file (md5 `b43ba2d1b1e531c1a23606fe6453f2d9`), also saved as `amp-amp3copy.js`.

## Helper wiring (done, preview not published)
- Copied amp3-gpt → amp4-fable (amp1, amp2, amp3-gpt left untouched).
- Snapshot of current site1 (intro / swipe / white tiles / 6s step, 6:15 AM ET) → `../site1-amp4/`, then `build-site1-amp4.py` hooked it to `../amp4-fable/`. Live `site1/` and `deploy-preview/site1/` were not written (index.md5 still `338f189f8483499329c162c2176d1870`).
- New files: `amp4-harness.mjs`, `amp4-perf.mjs`, `amp4-quick-shot.mjs`, `tools/make-sheet-amp4.py`, `build-site1-amp4.py`. Checks were not loosened (path/label updates only). The 21 tests were not run.

## Texture results vs the photos (for the later report)
Fixed or clearly better:
- Back lettering typo: `rear.jpg` / `scratch.png` now read **ZUNIGA, BLAKE** (comma, no apostrophe).
- Top-handle leather: oxblood / dark burgundy with white stitching, not salmon.
- Glaswerks badge lettering is readable (was a holey soft mask). Shape is still off: a separate oval plate with two rivets, not the real tight-contour plate with rivets on the G flourish.
- Tolex is finer and less faceted than the old crystalline Voronoi, but still a bit cell-like versus the real leather grain.
- Grille has more weave jitter than the old perfect checker, but is still fairly regular/tiled versus the real cloth.

Not done (amp.js pass never returned):
- Side handle still the thin chrome bar in ChatGPT's amp.js; needs the recessed Fender-style strap from 07/08.
- Phone standalone framing still tight (left side clipped) in index.html / amp.js.

## Resume after 11:10 AM ET
Re-run `fable/brief-ampjs.txt` with `CLAUDE_MODEL=fable /workspace/manager/ai.sh claude "WEBSITE" ...`. Then tests (`AMP_PORT=... node amp4-fable/amp4-harness.mjs`, 21 checks), sheet (`tools/make-sheet-amp4.py`), publish previews only to surge `/amp4/` and `/site1-amp4/`. Do not touch live `/site1/` or blakezuniga-site. If Fable is still out, stop and report again; do not write amp.js on Grok or switch models.

## Resumed Nov 16 11:14 AM ET (routine "Resume amp4 with Fable")
- Fable amp.js pass: `CLAUDE_MODEL=fable` via ai.sh, 863s, ok, session `274496f3-1eae-4d30-ad51-f4da89858656` (11:14–11:28 AM ET). Reply in `fable/run2/reply-ampjs.txt`: complete `amp.js` (1365 lines, md5 6c14baea86ccf3f3b64433f2a7fd40c5) and `index.html` (md5 fb822735c64a825b3df84ee465174a69), saved exactly (also as amp-fable-pass2.js / index-fable-pass2.html). ChatGPT amp3 copies kept as amp-amp3copy.js / index-amp3copy.html.
- Tests: 21/21 PASS (`test-logs/2026-11-16-amp4-fable.log`).
- Sheet: `shots/sheet.jpg` (side column now shows the Fender handle). Old shots in `shots/pre-fable-pass2/`; previous sheet script kept as tools/make-sheet-amp4-prev1.py.
- Published (first release, no prevN) to /amp4/ and /site1-amp4/; live /site1/ md5 still 338f189f8483499329c162c2176d1870. blakezuniga-site untouched.
- Fixed: recessed pocket side handle with pointed top, chrome strap, screws, washer-head screw (both sides); phone home now fits the whole amp; explore fit uses both FOVs + margin.
- Remaining: phone home renders the amp very dark (lighting/distance regression at portrait); FENDER lettering and F logo not legible on the strap; pocket lacks the chrome-lined look; tolex still cell-like; grille still fairly regular; badge plate shape.

## Published Nov 16 05:34 PM ET
https://bpz-guitar-versions.surge.sh/amp6/ and /site1-amp6/ (whole deploy-preview folder; existing paths kept). Live /site1/index.html md5 still 338f189f8483499329c162c2176d1870 (checked on surge after deploy).

## amp7 / site1-amp7 (Nov 16 2026, WEBSITE; code written on Grok per Blake t164u, plus t166u perf and t167u preload)
- Fixes: amp grounded on the guitar floor (placement v4, lit floor pool); desktop home pull-back (rk bisection) so the amp is whole and clear of ZUNIGA; top screws per 05-top.jpg (4 handle-end + 4 glide washers); no Explore Amp at launch/home (only the neck-end pop-up, gated on the amp being shown); jump on the amp (phone button + walker.jump); Back to Guitar with fly back to the neck end.
- Perf: amp built right after the reveal (t167u: not lazily at the tap); light slots so the guitar shaders don't recompile; compileAsync + staged texture uploads before the amp is shown; webp textures (amp bytes 3.25 MB -> 0.91 MB); pixel ratio capped at 1.75. Off-screen pausing / per-frame allocations: partial (frustum culling only).
- Tests: test-logs/2026-11-16-amp7.log, final try4 86/86 PASS (tries 1-3 kept). Measurement changes: screw probe reads batched geometry rings (the amp merges meshes); waitForFunction options were in the arg slot (30 s default applied) - fixed; Back-fly wait 90 s (0.2 s/frame fly cap); launch scan also on every frame and DOM change; REC_START counts pointerup as the tap. Absolute 100 ms / 50 ms tap targets can't be measured on SwiftShader; asserted renderer-independent forms.
- Caveat: home orbit auto-rotates; the fit is guaranteed at the start pose.

## amp8 / site1-amp8 (Nov 16–17 2026, WEBSITE; Opus per Blake t174u, then Grok per Blake t176u once Opus hit its limit at 12:15 AM ET)
Copies of amp7 / site1-amp7 (amp7 untouched). Changes:
- Intro: the 3D canvas stays hidden until ZUNIGA starts (no guitar flash); the amp boot is staged (prefetch during the intro,
  placement in idle slices, shader compile in safe frames, fade-in at the end of the reveal); the walk code loads in the background
  and the Explore Amp pop-up waits for it (`__amp8.walkReadyT`). Opus also fixed amp7's precompile (wrong light count and render
  target), so no shaders compile once the amp is on screen.
- Home placement (Grok): back-left of the guitar (centre < 45% of the width and left of the guitar), facing the camera squarely, no tilt.
- Walk: the camera horizon stays upright on the front, back and side faces; W moves toward the top of the screen and A/D match the screen;
  edge carry is smoothed (Opus); Grok added the edge freeze, the fallback hysteresis and the realignment on reaching the top.
- The handle is walkable (`place('handle', ...)`, `onHandle`, `lift`), and its look can be swapped with `handle.setHandle(part|null)`
  for Blake's red-handle pick (options are in amp8-handle-options/).
- Fender tilt-back legs #1 on both side panels (`amp-legs`, one shared geometry and material, assets/leg-amp8.webp, 25 KB).
- The pilot light is LED #2 (`amp-pilot`, userData.amp8Led = 'led-2'; bezel, faceted jewel, core and halo; swappable like setPilot).
- Opus's review of amp7: amp8/opus/review-amp7.md. Tests: amp8/amp8-harness.mjs, log in test-logs/2026-11-17-amp8.log.
- amp8d (Grok, Nov 17, 01:40 AM ET): the canvas is composited from the first frame but drawn black until ZUNIGA. Un-hiding the opacity-0 canvas at the fade-in cost one 2–5 s frame on SwiftShader. The amp's imports now wait for ZUNIGA to start.
