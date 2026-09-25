/**
 * Deciding.
 *
 * One entry, read by the token that came in the email, and then accepted or
 * declined. Reading is a GET and deciding is a POST, deliberately: mail clients
 * and link scanners follow links, and a decision that could be made by
 * something merely looking at a message is not a decision.
 *
 * The token is the whole of the authorisation. It is long, random and single-
 * purpose — it is a key to one submission and to nothing else, it cannot read
 * the queue and it cannot touch the library — and whoever holds it decides.
 * That is the bargain of a link in an inbox, and it is why the email says so.
 */

import * as supabase from '../server/supabase.js';
import { json, readBody, wrongMethod } from './_shared.js';

/** What the review page is allowed to see. The token it already has. */
const forReading = (entry) => ({
  status: entry.status,
  url: entry.url,
  title: entry.title,
  authors: entry.authors,
  publisher: entry.publisher,
  year: entry.year,
  summary: entry.summary,
  note: entry.note,
  contributor: entry.contributor,
  tags: entry.tags ?? [],
  submittedAt: entry.created_at,
  reviewedAt: entry.reviewed_at,
});

export default async function handler(req, res) {
  if (wrongMethod(req, res, ['GET', 'POST'])) return;

  if (!supabase.configured()) {
    return json(res, 503, { error: 'This Atlas is not connected to the library that keeps its queue.' });
  }

  const url = new URL(req.url, 'http://localhost');
  const body = req.method === 'POST' ? await readBody(req).catch(() => null) : null;
  const token = String(body?.token ?? url.searchParams.get('token') ?? '').trim();

  if (!token) return json(res, 400, { error: 'That link is missing the part that says which entry it is.' });

  try {
    if (req.method === 'GET') {
      const entry = await supabase.submission(token);
      if (!entry) return json(res, 404, { error: 'No entry answers to that link. It may have been reviewed already.' });
      return json(res, 200, { entry: forReading(entry), waiting: await supabase.waiting() });
    }

    const decision = String(body?.decision ?? '');
    const result = await supabase.decide(token, decision === 'accept' ? 'accept' : 'decline');
    if (!result.ok) {
      return json(res, result.entry ? 409 : 404, {
        error:
          result.reason === 'no such submission'
            ? 'No entry answers to that link.'
            : `This one was ${result.reason.replace('already ', '')} already.`,
        entry: result.entry ? forReading(result.entry) : undefined,
      });
    }

    return json(res, 200, {
      decision: result.decision,
      entry: forReading(result.entry),
      waiting: await supabase.waiting(),
    });
  } catch (error) {
    return json(res, 502, { error: `The library could not be reached. ${error.message}` });
  }
}
