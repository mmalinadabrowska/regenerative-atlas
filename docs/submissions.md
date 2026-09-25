# Taking entries in, and hearing about them

The Atlas is two things at once, and this is the seam between them. It is a
**static site** — a folder of pages and a baked copy of the library, which is
why it can be served from anywhere and why it survives you forgetting about it
for a year. And it is **curated**, by a person, from an open form that anybody
can reach. A static site cannot be added to, and a curated one should not be
added to without asking. So the door is one small function, and what comes
through it waits.

```
  someone submits          /api/sources        the entry is written to the
  on the website     ───▶  on the host   ───▶  submissions queue in Supabase
                                                         │
                                                         ▼
  it appears on the        the scheduled      an email reaches the curator,
  map at the next    ◀───  publish rebuilds ◀─ who opens one link and decides
  deploy                   the snapshot
```

Nothing is on the map until the decision. Nothing is lost if the email never
arrives — the queue is the record, and the email is only the telling.

## What you need

Three things, none of which cost anything at this size:

1. **A Supabase project** — where the library and the queue live.
   [docs/supabase.md](supabase.md) sets it up; come back here when
   `npm run supabase check` answers.
2. **A Resend account** — [resend.com](https://resend.com), for the email. The
   free tier is thousands of messages a month and you will send tens.
3. **The site deployed on Vercel** from this repository, which is where the
   function runs.

## 1. The queue

In the Supabase project, SQL Editor → New query, paste
[`supabase/schema.sql`](../supabase/schema.sql) and run it. It is safe to run
again on a project that already exists: everything in it is `if not exists`, and
the only new part is the `submissions` table at the bottom.

That table has row-level security on and **no policy at all**, which is the
point: the anon key — the one a browser may hold — can neither read the queue
nor write to it. Only the service role key can, and that key lives on the host.

## 2. The key that sends the mail

In Resend: **API Keys → Create**, with sending permission. Copy it once; you
cannot read it back.

You can send from `onboarding@resend.dev` immediately, which is fine to start
with and will very likely land in your spam folder the first time — mark it as
not spam and it will behave. To send from your own domain instead, add the
domain in Resend, put the DNS records it asks for wherever the domain is
managed, and set `ATLAS_MAIL_FROM` to an address at it.

## 3. Telling Vercel

Project → Settings → Environment Variables. Five, all for Production (and
Preview, if you want a preview deployment to behave the same):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key, from Supabase → Settings → API |
| `ATLAS_MAIL_KEY` | the Resend API key |
| `ATLAS_NOTIFY_TO` | where a new entry should be announced — your address |
| `ATLAS_SITE_URL` | `https://regenerative-atlas.vercel.app`, or your own domain |

`ATLAS_MAIL_FROM` is optional and defaults to Resend's lent address.
`ATLAS_SITE_URL` matters more than it looks: without it, the review link in the
email points at whichever deployment answered the request, which on a host that
builds every push means a preview URL that will one day be gone.

Two settings on the same page have to be right for any of this to run:

- **Root Directory** must be the repository root — not `public`. The pages are
  served from `public/` by way of `vercel.json`; the functions are read from
  `api/`, and a root directory of `public` hides them.
- **Node.js Version** 22.x or later.

Redeploy, then open `/api/health` on the site. It answers in booleans and never
in values:

```json
{ "ok": true, "accepting": true, "telling": true,
  "library": { "project": "abcdefgh", "reachable": true, "waiting": 0 },
  "notifications": { "to": ["ma…@gmail.com"] } }
```

`accepting: false` means there is no project and the form will say so honestly
rather than swallow a submission. `telling: false` means entries will queue up
unannounced — the queue still fills, you just are not told.

## 4. Publishing what you accept

Accepting writes the entry into the project. The map draws from
`public/data/snapshot.json`, which is committed — so one more step carries it
out onto the site, and it runs by itself:
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml) seeds a
database, pulls the project into it, bakes the snapshot, and commits it if it
changed, at seventeen minutes past every hour. The commit is a push, and the
push is what the host redeploys from.

Give it two repository secrets — Settings → Secrets and variables → Actions:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the same URL |
| `SUPABASE_ANON_KEY` | the **anon** key, not the service role one |

It only reads, so it only needs the read-only key. There is a **Run workflow**
button on the Actions tab for when you do not want to wait the hour.

On your own machine the same thing is `npm run refresh`, then commit
`public/data/snapshot.json`.

## What arrives, and what you do with it

The email carries everything a decision needs — what it is, who made it, where
it is grounded, the summary and the note somebody wrote about why it belongs —
so that deciding does not mean a second round of looking things up. At the
bottom is one link.

That link holds a token: 24 random bytes, a key to **one** submission and to
nothing else. It cannot list the queue, cannot read another entry, cannot touch
the library. Whoever opens it decides, which is the bargain every link in an
inbox makes, and is why the mail says so and why the page is `noindex` with its
referrer turned off — so the token is not handed to the site the entry links to
the moment you click through.

The link opens a page with the entry on it and two buttons. **Add it to the
Atlas** writes it into the library. **Leave it out** marks it declined and
writes nothing anywhere; the person who sent it is not told either way.

Deciding is a POST, not a link you can follow, on purpose: inboxes are full of
scanners and prefetchers that open every URL in a message, and an entry should
never be accepted by something merely looking at the email it came in.

## What stops a robot

- A field in the form that no person can see and no person will fill. A machine
  filling in every input finds it, and is thanked and ignored — answering as
  though it worked is what stops it coming back.
- Everything is put through the same validator the Atlas has always used: a
  link and a title are required, a tag is required, every field is clamped, and
  every tag is resolved against the vocabulary before anything is written.
- A link already queued is not queued twice, and a link already on the map is
  not queued at all — the person is told it is already there, which is true and
  is nicer than silence.
- Nothing is published by the function. The worst a flood can do is fill a
  table you can empty with one line of SQL:
  `delete from submissions where status = 'pending';`

## If something is wrong

**The form says the Atlas has nowhere to keep this.** `SUPABASE_URL` or
`SUPABASE_SERVICE_ROLE_KEY` is missing on the host. `/api/health` will say
`accepting: false`.

**Entries arrive but no email does.** `/api/health` says `telling: false` →
`ATLAS_MAIL_KEY` or `ATLAS_NOTIFY_TO` is unset. If it says `telling: true`, look
in Resend's own log: an unverified sender is the usual answer. Either way the
entries are in the `submissions` table, and the review link is
`<site>/review/?token=<the token in the row>`.

**The review link 404s.** The deployment it points at is gone. Set
`ATLAS_SITE_URL`, and reach the entry through a fresh link built from the token
in the table.

**Accepted entries are not on the map.** That is the publish, not the review.
Actions tab → publish → Run workflow, and check the two secrets are set.

## Keys, and where they are allowed to be

The service role key is a skeleton key to the whole project. It belongs in
Vercel's environment variables and in a `.env` file on your own machine, and
**nowhere else** — never in this repository, never in a message or a ticket or
a screenshot, never anywhere a browser can reach it. `.env` is git-ignored and
must stay that way. If one is ever exposed, treat it as burnt: Supabase →
Settings → API → roll it, and paste the new one into Vercel.

The anon key is read-only, is the one the scheduled publish uses, and is the
only one that is safe in public.
