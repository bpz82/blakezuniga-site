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
export const ACTIVE = ['about', 'music', 'videos', 'shop', 'contact', 'selftest-broken'];

// Ids that were once used and are now retired. Never remove an id from this list.
export const RETIRED = [];
