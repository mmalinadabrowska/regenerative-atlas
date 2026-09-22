# Connecting the Atlas to Supabase

A walkthrough, assuming no prior acquaintance with Supabase, databases, or the terminal
beyond copying a line and pressing return. It takes about fifteen minutes, most of which
is waiting for a project to finish setting itself up.

## What this actually does, in one paragraph

The Atlas keeps its library in a file — `data/atlas.db` — sitting on whatever machine is
running it. That is fine while it is only you and your laptop, and no good at all the
moment you want the library to outlive the laptop, or to be read by anything else. So the
library gets a second home: a Supabase project, which is a Postgres database somebody else
keeps running. After this, the Atlas **reads the library down from Supabase when it
starts** and **writes every new source up as it is added**. The file on your machine stays
— it is what the map is drawn from, because the map asks it thousands of questions a
second and a network cannot answer that fast — but it is a copy now, not the original.

Nothing here is reversible in a way that matters. If it goes wrong, delete the `.env` file
and the Atlas goes back to exactly what it was.

---

## Before you start

You need the Atlas running on your own machine. In a terminal, in the project folder:

```
node --version      # needs to say v22.5 or higher
npm start
```

That should print something like `28 sources · http://localhost:4321`. Open that address
in a browser and you should see the Atlas. Stop the server with `Ctrl-C` when you want to.

If `node --version` says 22.4 or lower, or "command not found", install Node from
[nodejs.org](https://nodejs.org) (the version marked LTS) and try again.

---

## Step 1 — Make the project

Skip to step 2 if you already have one called **Regenerative Atlas**.

1. Go to [supabase.com](https://supabase.com) and sign in (GitHub is the quickest).
2. **New project**. Name it `Regenerative Atlas`.
3. It asks for a **database password**. This is not the password you will use later — it
   is for connecting to Postgres directly, which we never do. Let it generate one, save it
   in your password manager, and move on.
4. Pick the region closest to you. London or Frankfurt if you are in the UK or Europe.
5. **Create new project**, then wait. It takes a minute or two to finish building.

The free tier is enough for this and will be for a long time: a bibliography of ten
thousand sources is a few megabytes.

## Step 2 — Make the tables

A new project is an empty database. The Atlas needs three tables, and the file that makes
them is already in the repository.

1. Open `supabase/schema.sql` in the project folder and copy all of it.
2. In Supabase, in the left sidebar: **SQL Editor** → **New query**.
3. Paste it in and press **Run** (or ⌘-return).

It should say *Success. No rows returned.* That is what success looks like here — it made
things rather than found things.

What you just created: a table of `sources` (the research), a table of `tags` (the
vocabulary), a table joining them, and a rule that says **anyone may read the library and
nobody may write to it except with the secret key**. That last part is why it is safe to
put this behind a public website later.

## Step 3 — Get the two keys

In Supabase: **Settings** (the cog, bottom left) → **API**.

Two things on that page matter:

- **Project URL** — looks like `https://abcdefghijklmnop.supabase.co`
- **Project API keys → `service_role`** — a very long string. It is hidden behind a
  *Reveal* button, because it is the one that can write.

> **The service role key is a skeleton key.** Anyone who has it can add, change or delete
> anything in the project. It goes on the machine running the Atlas and nowhere else:
> never in the repository, never in a message, never in anything a browser downloads. The
> other key on that page — `anon` — can only read, and is the one to use if you ever want
> a browser to talk to Supabase directly.

## Step 4 — Tell the Atlas about them

In the project folder there is a file called `.env.example`. Make a copy of it named
`.env` — just `.env`, with the dot, and nothing after it.

Open it and fill in the two values you just copied:

```
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...the-very-long-one
```

No quotes needed, no spaces around the `=`. Save it.

`.env` is listed in `.gitignore`, so it will not be committed, and you should keep it that
way.

## Step 5 — Check it answers

```
npm run supabase check
```

If all is well:

```
  abcdefghijklmnop: reachable, tables present.
  there: 0 sources · here: 28
```

If it complains, the message says which of the three things went wrong — the tables are
not there (go back to step 2), the key was refused (step 3, and make sure it is the
`service_role` one), or the address is wrong (step 4).

## Step 6 — Send the library up

```
npm run supabase push
```

You will see it count through the sources. When it finishes, go and look: in Supabase,
**Table Editor** → `sources`. Your research is in there, one row each, with the tags
joined on. That is the moment the library stops living only on your laptop.

## Step 7 — Run it connected

```
npm start
```

It now prints an extra line before the usual one:

```
  supabase: 28 sources from abcdefghijklmnop (0 new here)
  Regenerative Atlas
  28 sources · http://localhost:4321
```

Add a source through the **Add** page and it will appear in the Supabase table within a
second. That is the whole thing working.

---

## What to do when

| You want to | Run |
| --- | --- |
| check the connection | `npm run supabase check` |
| send this machine's library up | `npm run supabase push` |
| bring the library down | `npm run supabase pull` |
| go back to no Supabase at all | delete `.env` |

`pull` is the useful one on a second machine: clone the repository, make the same `.env`,
run `npm run supabase pull`, and you have the library.

## Things that will come up

**"I added something and it says it could not reach the shared library."** The source is
still on your map — the local write happened first, on purpose. Run
`npm run supabase push` once you are back online and it will go up.

**Two people adding at once.** Fine. A source is identified by its link, so the same paper
added twice is one row, and the tags merge.

**Putting it on the internet.** When the Atlas is hosted somewhere rather than run on your
laptop, that host will have a way to set environment variables (Railway, Render and Fly
all call it "Variables" or "Secrets"). Put the same two values there instead of in a
`.env` file, and do not copy `.env` onto the server.

**Is the data locked in?** No. `npm run supabase pull` brings it all back, and
`/api/export.json` and `/api/export.bib` still take the whole library at any time. That is
deliberate: a library you cannot leave with is not yours.
