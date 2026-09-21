/**
 * Move the library between this machine and the Supabase project.
 *
 *   npm run supabase check   does the project answer, and are the tables there
 *   npm run supabase push    send everything here up  (seeding, or after a spell offline)
 *   npm run supabase pull    bring everything there down into the local database
 *
 * The server pulls on boot and writes through on every submission, so this is
 * for the two moments that are not that: the first fill, and putting things
 * right afterwards.
 */

import { openDatabase } from '../server/db.js';
import * as supabase from '../server/supabase.js';

const [, , command = 'check'] = process.argv;

if (!supabase.configured()) {
  console.error(`
  No Supabase credentials in the environment.

    SUPABASE_URL=https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<the service role key>

  The service role key writes; the anon key can only read. Keep the service
  role key out of the repository and out of anything a browser can see — an
  environment variable on the machine that runs the server, and nowhere else.
`);
  process.exit(1);
}

const atlas = openDatabase();
const where = supabase.projectRef();

try {
  if (command === 'check') {
    await supabase.check();
    const there = await supabase.fetchLibrary();
    console.log(`\n  ${where}: reachable, tables present.`);
    console.log(`  there: ${there.length} sources · here: ${atlas.count()}\n`);
  } else if (command === 'push') {
    const sent = await supabase.pushAll(atlas, {
      onProgress: (n, total, source) =>
        process.stdout.write(`\r  ${String(n).padStart(4)}/${total}  ${source.title.slice(0, 48)}`.padEnd(70)),
    });
    console.log(`\r  ${sent} sources pushed to ${where}.`.padEnd(70) + '\n');
  } else if (command === 'pull') {
    const { fetched, added } = await supabase.pull(atlas);
    console.log(`\n  ${fetched} sources read from ${where}, ${added} new here.`);
    console.log(`  ${atlas.count()} sources in the local library now.\n`);
  } else {
    console.error(`  Unknown command "${command}". Try check, push or pull.`);
    process.exit(1);
  }
} catch (error) {
  console.error(`\n  ${error.message}`);
  if (error.status === 404) {
    console.error('  The tables are not there yet — run supabase/schema.sql in the SQL editor.\n');
  } else if (error.status === 401 || error.status === 403) {
    console.error('  The key was refused. A service role key is needed to write.\n');
  } else {
    console.error('');
  }
  process.exit(1);
} finally {
  atlas.close();
}
