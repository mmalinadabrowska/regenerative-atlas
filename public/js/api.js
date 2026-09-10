/** Thin wrapper over the Atlas API — every page talks to the server through here. */

async function request(path, options) {
  const response = await fetch(path, {
    headers: { accept: 'application/json', ...(options?.body ? { 'content-type': 'application/json' } : {}) },
    ...options,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? `The Atlas could not answer (${response.status}).`);
  }
  return body;
}

export const api = {
  stats: () => request('/api/stats'),
  tags: () => request('/api/tags'),
  vocabulary: () => request('/api/vocabulary'),
  sources: (params = {}) => request(`/api/sources?${new URLSearchParams(params)}`),
  graph: (params = {}) => request(`/api/graph?${new URLSearchParams(params)}`),
  describe: (url) => request('/api/describe', { method: 'POST', body: JSON.stringify({ url }) }),
  submit: (source) => request('/api/sources', { method: 'POST', body: JSON.stringify(source) }),
};

/** Escape anything that came from a contributor before it touches innerHTML. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Authors · Publisher · 2014" without stray separators when fields are blank. */
export function citationLine(source) {
  return [source.authors, source.publisher, source.year].filter(Boolean).join(' · ');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Keeps the source count in the top bar honest without every page repeating it. */
export async function fillCount(selector = '[data-count]') {
  const node = document.querySelector(selector);
  if (!node) return;
  try {
    const { sources, tags } = await api.stats();
    node.textContent = `${sources} sources · ${tags} tags`;
  } catch {
    node.textContent = '';
  }
}
