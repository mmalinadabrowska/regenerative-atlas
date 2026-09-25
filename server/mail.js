/**
 * Sending one email, with nothing installed.
 *
 * The Atlas has no dependencies and this does not change that: a transactional
 * mail API is one HTTPS POST, the same bargain the Supabase adapter takes —
 * `fetch` against an endpoint rather than a client library wrapping it. The
 * request below is Resend's, which is the shape several others copy; anything
 * that accepts {from, to, subject, text, html} at an endpoint you can name will
 * work by setting ATLAS_MAIL_API.
 *
 * SMTP was the other road. It would need no account anywhere, but it wants a
 * long-lived socket on a port most hosts close, and the machine this runs on is
 * a function that lives for a second — so the socket is the wrong shape for the
 * place, however right it is in principle.
 *
 *   ATLAS_MAIL_KEY    the provider's API key. Nothing is sent without it.
 *   ATLAS_NOTIFY_TO   who hears about a new entry. Nothing is sent without it.
 *   ATLAS_MAIL_FROM   the sender, which the provider has to have verified.
 *   ATLAS_MAIL_API    the endpoint, if not Resend's.
 *
 * With the first two unset nothing is sent and nothing fails: a submission is
 * still queued, and the queue is still there to be read. Mail is how you are
 * told, not where the entry is kept.
 */

const DEFAULT_API = 'https://api.resend.com/emails';

/** Resend lends this address to a project with no domain of its own yet. */
const DEFAULT_FROM = 'Regenerative Atlas <onboarding@resend.dev>';

function settings() {
  return {
    api: process.env.ATLAS_MAIL_API || DEFAULT_API,
    key: process.env.ATLAS_MAIL_KEY || '',
    to: (process.env.ATLAS_NOTIFY_TO || '').split(',').map((a) => a.trim()).filter(Boolean),
    from: process.env.ATLAS_MAIL_FROM || DEFAULT_FROM,
  };
}

/** Whether there is both a key to send with and somebody to send to. */
export function configured() {
  const { key, to } = settings();
  return Boolean(key && to.length > 0);
}

export function recipients() {
  return settings().to;
}

export class MailError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Send one message. Throws on a refusal so a caller who cares can log it; the
 * submission path does not care enough to fail a contributor's submission over
 * it, and says so where it calls this.
 */
export async function send({ subject, text, html, replyTo }) {
  const { api, key, to, from } = settings();
  if (!key || to.length === 0) throw new MailError(0, 'No mail key or no recipient in the environment.');

  const response = await fetch(api, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      // So that replying to the notification reaches whoever submitted, when
      // they left a way to be reached.
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    let said = response.statusText;
    try {
      said = JSON.parse(body)?.message ?? said;
    } catch {
      /* the provider answered with something that was not JSON; keep the status */
    }
    throw new MailError(response.status, `The mail provider said: ${said}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return { ok: true };
  }
}
