/**
 * What a new entry looks like when it arrives in your inbox.
 *
 * Composition is kept apart from sending so the words can be tested without a
 * mail account, and so the same message can be read as plain text by a mail
 * client that wants text and as a page by one that wants a page. Both say the
 * same things in the same order; neither hides anything the other shows.
 *
 * The email is for deciding with. Everything you would need to judge an entry
 * is in it — what it is, who made it, where it is grounded, what the person
 * submitting it said — so the link at the bottom is a confirmation rather than
 * a second lookup.
 */

import { resolveTag } from './vocabulary.js';
import * as mail from './mail.js';

const PAPER = '#f2ecdf';
const INK = '#100f0d';
const FAINT = 'rgba(16, 15, 13, 0.55)';
const SERIF = "'EB Garamond', 'Hoefler Text', Garamond, Georgia, 'Times New Roman', serif";

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** "Authors · Publisher · 2014", without stray separators when fields are blank. */
const citation = (entry) => [entry.authors, entry.publisher, entry.year].filter(Boolean).join(' · ');

/** Tags, in the vocabulary's own words rather than as slugs. */
function readTags(slugs) {
  const seen = [];
  for (const slug of slugs ?? []) {
    const tag = resolveTag(slug);
    if (tag) seen.push(tag);
  }
  return {
    places: seen.filter((t) => t.facet === 'location'),
    themes: seen.filter((t) => t.facet !== 'location'),
  };
}

/**
 * Subject, plain text and HTML for one submission.
 *
 * `reviewUrl` is where the decision is made; it carries the token that stands
 * for the entry, so it is the one part of this message that must not be passed
 * on to anybody else.
 */
export function compose(entry, { reviewUrl } = {}) {
  const { themes, places } = readTags(entry.tags);
  const line = citation(entry);

  const paragraphs = [];
  paragraphs.push(entry.title);
  if (line) paragraphs.push(line);
  paragraphs.push(entry.url);
  paragraphs.push('');
  if (themes.length) paragraphs.push(`Tagged   ${themes.map((t) => t.label).join(', ')}`);
  if (places.length) paragraphs.push(`Grounded in   ${places.map((t) => t.label).join(', ')}`);
  if (entry.summary) paragraphs.push('', entry.summary);
  if (entry.note) paragraphs.push('', `Why it belongs: ${entry.note}`);
  paragraphs.push('', entry.contributor ? `Submitted by ${entry.contributor}.` : 'Submitted anonymously.');
  if (reviewUrl) {
    paragraphs.push(
      '',
      'It is not on the map. Nothing is, until you say so:',
      reviewUrl,
      '',
      'That link is the only key to this entry — it decides for whoever opens it.',
    );
  }

  const row = (label, value) =>
    value
      ? `<tr>
      <td style="width:1%;padding:0 1.2em .55em 0;color:${FAINT};font-size:14px;white-space:nowrap;vertical-align:top">${escape(label)}</td>
      <td style="padding:0 0 .55em;font-size:15px;vertical-align:top">${value}</td>
    </tr>`
      : '';

  const html = `<!doctype html>
<html><body style="margin:0;padding:28px 18px;background:${PAPER};color:${INK};font-family:${SERIF}">
  <div style="max-width:34em;margin:0 auto">
    <p style="margin:0 0 1.6em;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${FAINT}">
      Regenerative Atlas — a new entry
    </p>

    <h1 style="margin:0 0 .3em;font-size:26px;line-height:1.25;font-weight:400">${escape(entry.title)}</h1>
    ${line ? `<p style="margin:0 0 .5em;font-size:15px;color:${FAINT}">${escape(line)}</p>` : ''}
    <p style="margin:0 0 1.6em;font-size:15px;word-break:break-all">
      <a href="${escape(entry.url)}" style="color:${INK}">${escape(entry.url)}</a>
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid rgba(16,15,13,.14);padding-top:1.2em">
      ${row('Tagged', escape(themes.map((t) => t.label).join(', ')))}
      ${row('Grounded in', escape(places.map((t) => t.label).join(', ')))}
      ${row('Summary', escape(entry.summary).replace(/\n+/g, '<br>'))}
      ${row('Why it belongs', escape(entry.note).replace(/\n+/g, '<br>'))}
      ${row('Submitted by', escape(entry.contributor) || '<span style="color:' + FAINT + '">anonymously</span>')}
    </table>

    ${
      reviewUrl
        ? `<p style="margin:2em 0 .8em;font-size:15px">It is not on the map. Nothing is, until you say so.</p>
    <p style="margin:0 0 1.4em">
      <a href="${escape(reviewUrl)}"
         style="display:inline-block;background:${INK};color:${PAPER};text-decoration:none;
                font-size:16px;padding:.62em 1.5em .5em;border-radius:999px">Read it and decide</a>
    </p>
    <p style="margin:0;font-size:13px;color:${FAINT}">
      That link is the only key to this entry — it decides for whoever opens it, so keep it to yourself.
    </p>`
        : ''
    }
  </div>
</body></html>`;

  return {
    subject: `A new entry for the Atlas — ${entry.title}`,
    text: paragraphs.join('\n'),
    html,
    // A reply goes to whoever submitted it, when they left an address rather
    // than a name in the contributor field.
    replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.contributor ?? '') ? entry.contributor : undefined,
  };
}

/**
 * Compose and send, and never let the sending of it break the submitting of it.
 *
 * A contributor who has just handed over a piece of research should not be told
 * their work was refused because a mail provider was having an afternoon. The
 * entry is already in the queue by the time this runs; this is the telling, and
 * what it returns is only ever read by the log.
 */
export async function announce(entry, options = {}) {
  if (!mail.configured()) return { sent: false, reason: 'no mail credentials in the environment' };
  try {
    await mail.send(compose(entry, options));
    return { sent: true, to: mail.recipients() };
  } catch (error) {
    return { sent: false, reason: error.message };
  }
}
