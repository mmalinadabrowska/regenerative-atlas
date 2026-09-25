/**
 * Reading a link so the contributor does not have to type it out.
 *
 * The same lookup the local server offers, on the host: fetch the page, read
 * what it says about itself, and hand back a filled form. It is a read and it
 * changes nothing — the one thing it adds here is whether the Atlas already
 * holds this link, which on the web means asking the project rather than a
 * database that is not there.
 */

import { ApiError } from '../server/api.js';
import { describeUrl } from '../server/metadata.js';
import * as supabase from '../server/supabase.js';
import { json, readBody, wrongMethod } from './_shared.js';

export default async function handler(req, res) {
  if (wrongMethod(req, res, ['POST'])) return;

  const body = await readBody(req).catch(() => null);
  const url = String(body?.url ?? '').trim().slice(0, 2000);
  if (!url) return json(res, 400, { error: 'Paste a link first.' });

  try {
    const described = await describeUrl(url);
    let alreadyInAtlas = null;
    if (supabase.configured()) {
      const found = await supabase.published(url).catch(() => null);
      if (found) alreadyInAtlas = { id: found.id, title: found.title };
    }
    return json(res, 200, { ...described, alreadyInAtlas });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 502;
    return json(res, status, { error: error.message });
  }
}
