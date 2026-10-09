# Working on the Regenerative Atlas

## Branches — read this first

- **`main` is live** (regenerativeatlas.com). **`dev` is staging** — Malina checks
  changes on its Vercel deployment before they go live.
- **Every new piece of work goes on its own feature branch, made from `dev`**:
  `feature/<short-name>` for features, `fix/<short-name>` for fixes,
  `chore/<short-name>` for housekeeping. Commit and push the feature branch.
- **Merge a feature branch into `dev` only when Malina says so.** Never push or
  merge to `dev` or `main` on your own initiative, and never merge `dev` into
  `main` unless she asks for exactly that.
- Before merging into `dev`, bring `dev` into the feature branch first and run
  `npm test`, so what lands on staging has been tested as it will be.
- The hourly "Publish the library" workflow commits `public/data/snapshot.json`
  to the repository's default branch. If that file conflicts in a merge, keep
  the newer published copy — it is built from the live library.

## Things that are easy to get wrong

- **The live library is in Supabase, not in `data/seed.json`.** Entries
  approved through the Add page exist only in Supabase. Never rebuild
  `public/data/snapshot.json` locally (`npm run build-static`) and commit it —
  it would drop those entries from the site. To change starter records, edit
  `data/seed.json` (or `npm run library:import` from `data/library.csv`), patch
  the same change into the existing snapshot, and regenerate
  `supabase/replace-library.sql` (`npm run supabase-sql`) for Malina to run in
  the Supabase SQL editor — otherwise the next hourly publish puts the old text
  back.
- **No dependencies, no build step.** Vercel serves `public/` as it is, with
  functions in `api/`. Don't add npm packages for things a script tag or a few
  lines of code can do.
- **Secrets never go in the repository** — `.env` is gitignored and stays so.
  The Supabase `service_role` key belongs only in Vercel's environment
  variables; the GitHub Actions secret is the read-only `anon` key.
- `npm test` runs everything (Node's built-in test runner); it should pass
  before anything is pushed.
