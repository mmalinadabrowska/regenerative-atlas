/**
 * Taking an entry in, on the web.
 *
 * The site is static: a folder of pages and a baked copy of the library, which
 * is why it can be served from anywhere and why it cannot, by itself, be added
 * to. This is the one door. What comes through it is not added to the Atlas —
 * it is written to the queue and the curator is emailed, and nothing appears on
 * the map until somebody decides it should.
 *
 * Everything a stranger sends is untrusted, and is put through exactly the same
 * validator the local server uses, so a record means the same thing however it
 * arrived: trimmed, clamped, and resolved against the vocabulary before it is
 * written anywhere at all.
 */

import { ApiError, validateSubmission } from '../server/api.js';
import * as supabase from '../server/supabase.js';
import { announce } from '../server/notify.js';
import { json, readBody, siteUrl, wrongMethod } from './_shared.js';

export default async function handler(req, res) {
  if (wrongMethod(req, res, ['POST'])) return;

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    return json(res, 413, { error: error.message });
  }

  // The form carries a field no person can see and no person will fill. A
  // machine filling in every input it finds fills this one too, and is thanked
  // and ignored: answering as though it worked is what stops it coming back.
  if (typeof body?.website === 'string' && body.website.trim() !== '') {
    return json(res, 202, { queued: true, waiting: 1 });
  }

  let submission;
  try {
    submission = validateSubmission(body);
  } catch (error) {
    if (error instanceof ApiError) return json(res, error.status, { error: error.message, details: error.details });
    throw error;
  }

  if (!supabase.configured()) {
    return json(res, 503, {
      error:
        'The Atlas has nowhere to keep this yet — the library it writes to is not connected. ' +
        'Nothing has been lost, but nothing has been saved either; try again later, or send the link to the curator.',
    });
  }

  try {
    const already = await supabase.published(submission.url);
    if (already) {
      return json(res, 200, {
        queued: false,
        alreadyInAtlas: { title: already.title },
      });
    }

    const { entry, queued } = await supabase.queue(submission);

    // Told before the answer goes back, not after: a function stops the moment
    // it replies, and work left running past that point is work that may simply
    // not happen. The wait is one request, and a contributor can spare it.
    const told = queued
      ? await announce(entry, { reviewUrl: `${siteUrl(req)}/review/?token=${encodeURIComponent(entry.token)}` })
      : { sent: false, reason: 'already waiting' };

    // The token never comes back out to the browser. It is the key to the
    // review page, and the only copy of it that should exist outside the
    // project is the one in the curator's inbox.
    return json(res, queued ? 202 : 200, {
      queued,
      alreadyWaiting: !queued,
      title: entry.title,
      told: told.sent,
    });
  } catch (error) {
    return json(res, 502, {
      error: `The Atlas could not reach the library it keeps. ${error.message}`,
    });
  }
}
