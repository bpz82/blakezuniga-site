/*
 * PERMANENT WIDGET IDS
 * --------------------
 * Ids are permanent. You may ADD a new id or RETIRE one (move it from ACTIVE to
 * RETIRED). You may NEVER rename an id or reuse a retired id for something else.
 * Stored data, links and tests may refer to these ids long after a widget is gone.
 * harness.register() accepts only ids listed in ACTIVE and rejects ids in RETIRED.
 * Tests enforce these rules.
 */

// Ids that may be registered.
// 'selftest-broken' is TEST-ONLY: it is registered only when the page URL has ?selftest=1.
// amp12 (Blake t208u): 'photos' added (the Photos module, photos.js)
// t307u: 'photos' retired (moved to RETIRED), replaced by the 3D photo TV (photo-tv/)
// Vinyl Vault (Blake, 23 Nov 2026): 'vinyl-vault' added (apps/vinyl-vault/vinyl-vault.js)
export const ACTIVE = ['contact', 'collaborative-projects', 'vinyl-vault', 'selftest-broken'];

// Ids that were once used and are now retired. Never remove an id from this list.
export const RETIRED = ['about', 'music', 'videos', 'shop', 'photos'];
