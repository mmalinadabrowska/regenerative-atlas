/**
 * A PDF, written by hand.
 *
 * The print button used to ask the browser to print, which is the right answer
 * on a laptop and no answer at all on a phone: inside an app's web view, or
 * inside the sandbox a published page runs in, `window.print()` is quietly
 * ignored and nothing happens. A file, on the other hand, can always be handed
 * over — the same way the bibliography already is.
 *
 * So this writes the PDF itself. It is a small format if you only need what a
 * page of type needs: a catalogue of objects, a stream of text-positioning
 * operators, and a table of byte offsets at the end. No library, which is the
 * rule everywhere else in this project, and no 300KB of one to draw eleven
 * lines of type.
 *
 * Two things make it tractable. The fourteen fonts every reader already has
 * need no embedding, and the two used here — Helvetica and Times — have the
 * same advance widths as the Arial and Times New Roman sitting on the machine
 * that is drawing the page. So the browser can measure a line with canvas and
 * the reader will break it in exactly the same place.
 */

export const MM = 72 / 25.4;
export const A4 = { width: 210 * MM, height: 297 * MM };

/** The base fourteen, by the name a PDF knows them by, and their stand-ins. */
const FONTS = {
  sans: { pdf: 'Helvetica', css: 'Arial, Helvetica, sans-serif', weight: 'normal' },
  sansBold: { pdf: 'Helvetica-Bold', css: 'Arial, Helvetica, sans-serif', weight: 'bold' },
  serif: { pdf: 'Times-Roman', css: '"Times New Roman", Times, serif', weight: 'normal' },
};

const FONT_KEYS = Object.keys(FONTS);

/*
 * WinAnsi is Latin-1 with the control band filled in by the punctuation a
 * bibliography is full of. Anything outside it is written as the nearest
 * plain character rather than as a black box.
 */
const WIN_ANSI = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86],
  ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c],
  ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b],
  ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

const PLAIN = new Map([
  [' ', ' '], [' ', ' '], [' ', ' '], ['‑', '-'], ['−', '-'],
]);

/** A string as WinAnsi bytes, escaped for a PDF literal. */
function literal(text) {
  let out = '';
  for (const character of String(text ?? '')) {
    const plain = PLAIN.get(character) ?? character;
    const code = WIN_ANSI.get(plain) ?? plain.codePointAt(0);
    if (code > 0xff) {
      out += '?';
      continue;
    }
    if (plain === '(' || plain === ')' || plain === '\\') out += `\\${plain}`;
    else if (code < 32) out += ' ';
    else if (code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += plain;
  }
  return out;
}

/* --- measuring ----------------------------------------------------------- */

let ruler = null;

export function widthOf(text, key, size) {
  if (!ruler) ruler = document.createElement('canvas').getContext('2d');
  const font = FONTS[key];
  ruler.font = `${font.weight} ${size}px ${font.css}`;
  return ruler.measureText(String(text ?? '')).width;
}

/** Break a string to a width, on spaces where it can and mid-word when it must. */
export function wrap(text, key, size, room) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, key, size) <= room || !line) {
        // A single word longer than the measure — a URL, usually — is cut.
        if (!line && widthOf(next, key, size) > room) {
          let piece = '';
          for (const character of next) {
            if (widthOf(piece + character, key, size) > room && piece) {
              lines.push(piece);
              piece = '';
            }
            piece += character;
          }
          line = piece;
          continue;
        }
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/* --- the page ------------------------------------------------------------ */

/**
 * A sheet that takes lines and finds them a page.
 *
 * Everything is measured from the top, because that is how type is set and how
 * a page fills; the flip into the PDF's own upward coordinates happens once,
 * at the moment a line is written.
 */
/**
 * What draws inside a frame: lines, closed shapes, rings and small type.
 *
 * It records rather than writes — each mark is kept as what it is and turned
 * into operators when the page is, so the one place that knows a page's height
 * stays the one place that flips a coordinate.
 *
 * Everything is grey: a printed record is black on white, and the map's colours
 * are a way of telling one theme from another on a screen, not information the
 * page has to carry. What survives the loss of colour is the drawing itself.
 */
class Pen {
  constructor(marks, box) {
    this.marks = marks;
    this.box = box;
  }

  line(x1, y1, x2, y2, { grey = 0.55, width = 0.3 } = {}) {
    this.marks.push({ kind: 'line', x1, y1, x2, y2, grey, width });
    return this;
  }

  /** A closed shape through a run of points, drawn as it is given. */
  shape(points, { grey = 0, width = 0.7, fill = null } = {}) {
    if (points.length > 1) this.marks.push({ kind: 'shape', points, grey, width, fill });
    return this;
  }

  ring(cx, cy, r, { grey = 0, width = 0.7, fill = null } = {}) {
    this.marks.push({ kind: 'ring', cx, cy, r, grey, width, fill });
    return this;
  }

  /** The mark a piece of research wears: a ring with a cross inside it. */
  crosshair(cx, cy, r, { grey = 0, width = 0.7 } = {}) {
    const arm = r * 0.82;
    this.ring(cx, cy, r, { grey, width });
    this.line(cx - arm, cy, cx + arm, cy, { grey, width });
    this.line(cx, cy - arm, cx, cy + arm, { grey, width });
    return this;
  }

  /** The frame itself. Drawn from `this.box`, which a caller may narrow. */
  frame({ grey = 0.55, width = 0.5 } = {}) {
    const { x, y, w, h } = this.box;
    this.marks.push({
      kind: 'shape',
      points: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ],
      grey,
      width,
      fill: null,
    });
    return this;
  }

  /** Small type inside the drawing. `align` is 'left', 'centre' or 'right'. */
  label(text, x, y, { size = 5, grey = 0.25, font = 'sans', align = 'centre' } = {}) {
    const width = widthOf(text, font, size);
    const at = align === 'centre' ? x - width / 2 : align === 'right' ? x - width : x;
    this.marks.push({ kind: 'text', text, x: at, y, size, grey, font });
    return this;
  }
}

export class Sheet {
  constructor({ size = A4, margin = 15 * MM } = {}) {
    this.size = size;
    this.margin = margin;
    this.room = size.width - margin * 2;
    this.floor = size.height - margin;
    this.y = margin;
    this.pages = [[]];
  }

  get page() {
    return this.pages[this.pages.length - 1];
  }

  break() {
    this.pages.push([]);
    this.y = this.margin;
  }

  /** Keep a block together: start a page if what is coming will not fit. */
  reserve(height) {
    if (this.y + height > this.floor) this.break();
  }

  space(height) {
    this.y = Math.min(this.y + height, this.floor);
  }

  /** One run of type, wrapped, from the left margin unless told otherwise. */
  text(content, { font = 'sans', size = 10, leading = 1.45, grey = 0, indent = 0 } = {}) {
    const step = size * leading;
    for (const line of wrap(content, font, size, this.room - indent)) {
      if (this.y + step > this.floor) this.break();
      this.page.push({
        x: this.margin + indent,
        y: this.y + size,
        text: line,
        font,
        size,
        grey,
      });
      this.y += step;
    }
  }

  /**
   * A framed drawing, at a fixed size on the page.
   *
   * The frame is the point: a picture that grows and shrinks with what it holds
   * gives a sheaf of printed records a different shape on every page, and a
   * record is a document rather than a poster. So the box is always the same,
   * and what goes in it is fitted to the box.
   *
   * The hand is given coordinates measured from the top of the page like
   * everything else here; the flip into the PDF's upward coordinates happens
   * once, where the page is written out.
   */
  draw(height, paint) {
    this.reserve(height + 2);
    const box = { x: this.margin, y: this.y, w: this.room, h: height };
    const marks = [];
    paint(new Pen(marks, box), box);
    this.page.push({ marks });
    this.y += height;
    return box;
  }

  rule({ grey = 0, width = 0.4, gap = 0 } = {}) {
    this.y += gap;
    if (this.y + 2 > this.floor) this.break();
    this.page.push({ rule: true, x: this.margin, y: this.y, w: this.room, grey, width });
    this.y += 2;
  }
}

/* --- writing it out ------------------------------------------------------ */

const bytes = (text) => new TextEncoder().encode(text);

/** A circle, in the four curves PDF has for one. */
const KAPPA = 0.5522847498;

function circleOps(cx, cy, r, flip) {
  const k = r * KAPPA;
  const y = (v) => flip(v);
  return [
    `${(cx - r).toFixed(2)} ${y(cy).toFixed(2)} m`,
    `${(cx - r).toFixed(2)} ${y(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${y(cy - r).toFixed(2)} ${cx.toFixed(2)} ${y(cy - r).toFixed(2)} c`,
    `${(cx + k).toFixed(2)} ${y(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${y(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${y(cy).toFixed(2)} c`,
    `${(cx + r).toFixed(2)} ${y(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${y(cy + r).toFixed(2)} ${cx.toFixed(2)} ${y(cy + r).toFixed(2)} c`,
    `${(cx - k).toFixed(2)} ${y(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${y(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${y(cy).toFixed(2)} c`,
  ];
}

/** Stroke, fill, or both — whichever the mark asked for. */
const paintOp = (mark, closed) =>
  mark.fill !== null && mark.fill !== undefined ? (closed ? 'b' : 'B') : closed ? 's' : 'S';

function markOps(mark, flip) {
  const y = (v) => flip(v).toFixed(2);
  const parts = [];
  if (mark.fill !== null && mark.fill !== undefined) parts.push(`${mark.fill.toFixed(2)} g`);
  if (mark.kind !== 'text') parts.push(`${mark.grey.toFixed(2)} G`, `${mark.width} w`);

  if (mark.kind === 'line') {
    parts.push(
      `${mark.x1.toFixed(2)} ${y(mark.y1)} m`,
      `${mark.x2.toFixed(2)} ${y(mark.y2)} l`,
      'S',
    );
  } else if (mark.kind === 'shape') {
    const [first, ...rest] = mark.points;
    parts.push(`${first[0].toFixed(2)} ${y(first[1])} m`);
    for (const [px, py] of rest) parts.push(`${px.toFixed(2)} ${y(py)} l`);
    parts.push(paintOp(mark, true));
  } else if (mark.kind === 'ring') {
    parts.push(...circleOps(mark.cx, mark.cy, mark.r, flip), paintOp(mark, true));
  } else if (mark.kind === 'text') {
    parts.push(
      `${mark.grey.toFixed(2)} g`,
      'BT',
      `/${mark.font} ${mark.size} Tf`,
      `${mark.x.toFixed(2)} ${y(mark.y)} Td`,
      `(${literal(mark.text)}) Tj`,
      'ET',
    );
  }
  return parts;
}

function contentOf(page, height) {
  const parts = [];
  let grey = null;
  for (const item of page) {
    // A drawing keeps its own colours and line weights, and hands them back:
    // whatever the type around it had set is no longer what is set.
    if (item.marks) {
      parts.push('q');
      for (const mark of item.marks) parts.push(...markOps(mark, (v) => height - v));
      parts.push('Q');
      grey = null;
      continue;
    }
    if (item.grey !== grey) {
      grey = item.grey;
      parts.push(`${grey.toFixed(2)} g`, `${grey.toFixed(2)} G`);
    }
    if (item.rule) {
      parts.push(
        `${item.width} w`,
        `${item.x.toFixed(2)} ${(height - item.y).toFixed(2)} m`,
        `${(item.x + item.w).toFixed(2)} ${(height - item.y).toFixed(2)} l`,
        'S',
      );
      continue;
    }
    parts.push(
      'BT',
      `/${item.font} ${item.size} Tf`,
      `${item.x.toFixed(2)} ${(height - item.y).toFixed(2)} Td`,
      `(${literal(item.text)}) Tj`,
      'ET',
    );
  }
  return parts.join('\n');
}

/**
 * The file. Objects are written in order and their byte offsets collected, so
 * the cross-reference table at the end is the truth rather than a guess.
 */
export function toBlob(sheet) {
  const chunks = [];
  const offsets = [0];
  let length = 0;

  const put = (text) => {
    const data = bytes(text);
    chunks.push(data);
    length += data.length;
  };
  const object = (n, body) => {
    offsets[n] = length;
    put(`${n} 0 obj\n${body}\nendobj\n`);
  };

  const pageCount = sheet.pages.length;
  const fontStart = 3 + pageCount * 2;
  const total = fontStart + FONT_KEYS.length - 1;

  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

  const kids = sheet.pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`);

  const fonts = FONT_KEYS.map((key, i) => `/${key} ${fontStart + i} 0 R`).join(' ');
  sheet.pages.forEach((page, i) => {
    const id = 3 + i * 2;
    object(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${sheet.size.width.toFixed(2)} ` +
        `${sheet.size.height.toFixed(2)}] /Resources << /Font << ${fonts} >> >> ` +
        `/Contents ${id + 1} 0 R >>`,
    );
    const stream = contentOf(page, sheet.size.height);
    object(id + 1, `<< /Length ${bytes(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  FONT_KEYS.forEach((key, i) => {
    object(
      fontStart + i,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[key].pdf} /Encoding /WinAnsiEncoding >>`,
    );
  });

  const xref = length;
  const rows = [`0000000000 65535 f `];
  for (let n = 1; n <= total; n++) rows.push(`${String(offsets[n]).padStart(10, '0')} 00000 n `);
  put(`xref\n0 ${total + 1}\n${rows.join('\n')}\n`);
  put(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}
