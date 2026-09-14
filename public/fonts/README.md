# Fonts bundled with the Atlas

Two faces, both from the [Bye Bye Binary](https://typotheque.byebyebinary.space)
collective, both post-binary, and both under the collective's CUTE rather than this
project's MIT licence. Enby Gertrude sets the display and reading type; Tremplin sets the
buttons, labels and interface.

## Enby Gertrude

Drawn by **Valentin Chauveau** and **Léna Salabert-Triby**, published by the
**Bye Bye Binary** collective.

- Source: <https://gitlab.com/bye-bye-binary/enby-gertrude>
- Typotheque: <https://typotheque.genderfluid.space>

Enby Gertrude is a post-binary typeface: alongside an ordinary text roman it
carries a set of ligatures that set inclusive French — the médian point drawn
into the letterforms rather than dropped between them — together with the
OpenType features that switch them on. Those characters are the point of the
font, and the licence asks that they are never stripped out.

### It is not under this project's licence

The Atlas' own code is MIT. **This directory is not.** Enby Gertrude travels
under Bye Bye Binary's own terms, and the two cohabit rather than merge:

- `enby-gertrude/2024_BBB_CUTE_FR.pdf` — the **CUTE** (*Conditions d'Utilisations
  Typographiques Engageantes*), v0.1, in French. These are the terms the
  collective publishes the font under.
- The font's internal metadata additionally names the **OIFL**, Bye Bye Binary's
  rewrite of the SIL Open Font License in inclusive language.

Read the CUTE before doing anything with these files. In short, it allows use,
copying, redistribution and modification including commercially, and asks in
return that you:

1. **credit the designers and link back to the source** — the Atlas does this in
   the colophon on its landing page, and here;
2. **pass on the complete folder**, not a lone font file — which is why the whole
   upstream package is vendored here, sources, specimen, documentation and all,
   rather than just the woff2 the site actually loads;
3. **keep it under the CUTE** if you redistribute or modify it;
4. **never remove the post-binary characters or the OpenType features that reach
   them**, and rename any fork while keeping the lineage legible;
5. **place yourself on the donation scale** set out at the end of the CUTE.

Point 5 is a real condition, not a suggestion, and it is not something a
repository can discharge on anyone's behalf. The scale runs from *pay nothing if
money is a barrier* for precarious and activist work, through €10–50 for
research and self-organised practice, to €300–1000 for a cultural institution.
If you deploy the Atlas somewhere funded, find your rung and pay it. Bye Bye
Binary's donation details live with the typotheque above.

## Tremplin

Drawn by **Benjamin Dott**.

- Source: <https://gitlab.com/bye-bye-binary/tremplin>
  (bundled from `cf730eb`)

Tremplin was drawn for *texte de labeur* and titling both — the research behind it was
about post-binary glyphs and legibility over long text, with the médian point built
directly into each inclusive ligature rather than set between letters. That is why it
carries the interface here: every button, label, tag, form field and map annotation, the
role Poppins held in the original mockups.

It ships in Light, Regular and Bold, and all three are declared, so weight is real rather
than synthesised by the browser. There is a variable version in `tremplin/variable/` that
the Atlas does not currently load.

Same terms as Enby Gertrude — the CUTE, here in both French and English at
`tremplin/Licence/`. The same five conditions apply, the donation scale included, and the
whole upstream package is bundled for the same reason.

Its post-binary ligatures are discretionary, so they do not fire on the Atlas' English
copy; they are there for anyone setting inclusive French with it, and must not be stripped.

### If you would rather not ship them

Delete `public/fonts/enby-gertrude/` or `public/fonts/tremplin/`. Nothing breaks: the stacks
in `public/styles/atlas.css` fall through — the display face to EB Garamond, then Hoefler
Text, then Georgia; the sans to Century Gothic, then Questrial, then Futura. The Atlas
will simply be less itself.
