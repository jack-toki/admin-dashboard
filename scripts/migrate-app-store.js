const fs = require('fs');
const path = require('path');

const sqlPath = path.join(__dirname, '..', 'supabase', 'app_store.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const required = ['app_oauth_tokens', 'automation_registry', 'automation_events', 'plan_entries', 'login_attempts', 'enable row level security'];

function check() {
  const missing = required.filter((name) => !sql.toLowerCase().includes(name));
  if (missing.length) {
    console.error(`app store SQL is missing: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (!/not run by the app/i.test(sql)) {
    console.error('app store SQL must say it is not run by the app');
    process.exit(1);
  }
  console.log('app store SQL check ok');
}

async function apply() {
  const url = process.env.TOKI_EPHEMERAL_DATABASE_URL || '';
  if (!url) {
    console.error('Refusing to apply. Set TOKI_EPHEMERAL_DATABASE_URL to a disposable database. This script does not use production credentials.');
    process.exit(2);
  }
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error('Refusing to apply outside localhost.');
    process.exit(2);
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    const tables = await client.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1)", [required.filter((name) => !name.includes(' '))]);
    if (tables.rowCount < 5) throw new Error('tables_missing');
    console.log('ephemeral app store SQL applied');
  } finally {
    await client.end();
  }
}

const mode = process.argv[2] || '--check';
if (mode === '--check') check();
else if (mode === '--apply') apply().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
else {
  console.error('Use --check or --apply');
  process.exit(2);
}
