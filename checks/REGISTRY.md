# Check registry

A check gates a launch only if it is listed here (RULES.md checker bylaws, Blake via MANAGER Nov 25 2026).
Every check exits nonzero on fail; a timeout or crash is ENV (rerun alone once, then report ENV).

| id | Blake ask | protects | Node/browser | runtime |
|----|-----------|----------|--------------|---------|
| ~~t452u-title-amp-size~~ RETIRED (t457u MEASUREMENT CHANGE, replaced by t457u-title-amp-world; file kept, not gating) | t452u | ZUNIGA title keeps the home on-screen size at amp/walk fov 72+ (place() scales layout.json title.s by tan(fov/2)/tan(19deg)) | Node | <1 s |
| t453u-vinyl-bar-hide | t453u | Vinyl Vault search bar is opaque (#120c0e), hides on scroll down / shows on scroll up (nextBarHidden), never hides while the search field is focused | Node | <1 s |
| t457u-title-amp-world | t457u | ZUNIGA + Folk Blues float in world space by the guitar in amp mode like Explore: title.js place() leaves the mesh pose alone in mode 'amp' (on top like walk) and index.html zgWordTick runs the word tick as 'walk' while body[data-mode]='amp' | Node | <1 s |
| t457u-sign-centered | t457u | Precious Memories plaque centred on the photo panel (inlaySign x = 0 for every layout.json neon pose / lx), rail side + y unchanged, lettering textAlign center at tx = w / 2 | Node | <1 s |
| t458u-vv-discover-cover | t458u | Vinyl Vault Discover & Listen card sits below the panel header (.vv-pop top = --vv-top from popTopInset(header bottom - panel top), set on every open and on resize) so the whole cover shows | Node | <1 s |
| t468u-launch-no-zp | t468u | Launch tree has no Zuniga Philosophy: no apps/zuniga-philosophy/ files, no zp-hook.js, no ?zp=1 hook in index.html or home/widget sources | Node | <1 s |
| t473u-app-button-font | t473u | Home-page app tile labels (.zg-label) are clearly legible: declared/computed font-size >= 14px at phone 393 (size 88) and >= 16px at desktop 700/1280, Zuniga Mission, no mid-word wrap or text-width overflow of the longest word (tracking may tighten to 0; wrap at spaces OK). Tile size formulas unchanged. | Node | <1 s |
