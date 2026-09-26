/**
 * Turning a link into a key.
 *
 * Needed in places that have no business opening SQLite — the Supabase
 * adapter, the submission queue, the functions that run on the host with no
 * disk at all — and in the browser, which is why the rule itself lives in
 * public/js/keys.js and this only passes it on.
 */

export { urlKey } from '../public/js/keys.js';
