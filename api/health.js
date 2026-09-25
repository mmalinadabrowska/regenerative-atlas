/**
 * Is the submitting half of the Atlas actually wired up?
 *
 * Answers in booleans and never in values: whether there is a project to write
 * to and a way to send mail, not what the keys are. It is here so that setting
 * this up ends in something you can look at rather than in a form you have to
 * test on a stranger.
 */

import * as supabase from '../server/supabase.js';
import * as mail from '../server/mail.js';
import { json, siteUrl, wrongMethod } from './_shared.js';

export default async function handler(req, res) {
  if (wrongMethod(req, res, ['GET', 'HEAD'])) return;

  const store = supabase.configured();
  const post = mail.configured();
  let waiting = null;
  let reachable = null;
  if (store) {
    try {
      waiting = await supabase.waiting();
      reachable = true;
    } catch {
      reachable = false;
    }
  }

  json(res, 200, {
    ok: store && reachable !== false,
    site: siteUrl(req),
    library: store ? { project: supabase.projectRef(), reachable, waiting } : null,
    notifications: post ? { to: mail.recipients().map(obscure) } : null,
    // Said plainly, because the two halves fail differently: with no project
    // there is nowhere to put a submission and the form will say so; with no
    // mail key the queue still fills and nobody is told it has.
    accepting: store,
    telling: post,
  });
}

/** Enough of an address to recognise, not enough to harvest. */
function obscure(address) {
  const [name, host] = String(address).split('@');
  if (!host) return '…';
  return `${name.slice(0, 2)}…@${host}`;
}
