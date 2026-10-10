/**
 * The librarian's mark.
 *
 * A woodcut of a fossil shell — its face worked in short horizontal strokes, a
 * whorl of bands sweeping out from the middle — traced from the plate and
 * turned over, so the ink of the print is paper on a black disc. It lives in
 * /images/librarian.svg as one drawing, fetched once and cached, however many
 * times a page shows it.
 *
 * `label` names it for a screen reader where it stands alone; beside its own
 * label, as it usually is, it is decoration.
 */

export function librarianGlyph({ label = '' } = {}) {
  return `<img class="librarian-glyph" src="/images/librarian.svg" alt="${label}" draggable="false">`;
}
