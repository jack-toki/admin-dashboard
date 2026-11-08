#!/usr/bin/env node
// Writes a salted scrypt verifier. Does not print the password or the verifier.
//
//   DASHBOARD_PASSWORD_HASH_OUT=/path/to/verifier DASHBOARD_PASSWORD=... node scripts/dashboard-password-hash.js
//   DASHBOARD_PASSWORD_HASH_OUT=/path/to/verifier node scripts/dashboard-password-hash.js
//
// The second form reads the password from stdin. One trailing newline is removed.
// The environment variable is used exactly, with no trimming.
// Output file mode is 0600. Format is documented in .env.example.

const fs = require('fs');
const { createPasswordVerifier } = require('../lib/auth');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const out = process.env.DASHBOARD_PASSWORD_HASH_OUT;
if (!out) fail('Set DASHBOARD_PASSWORD_HASH_OUT to the destination file.');

let password;
if (process.env.DASHBOARD_PASSWORD != null && process.env.DASHBOARD_PASSWORD !== '') {
  password = process.env.DASHBOARD_PASSWORD;
} else {
  const stdin = fs.readFileSync(0, 'utf8');
  password = stdin.endsWith('\n') ? stdin.slice(0, -1).replace(/\r$/, '') : stdin;
}
if (!password) fail('Set DASHBOARD_PASSWORD or pipe the password on stdin.');

const verifier = createPasswordVerifier(password);
fs.writeFileSync(out, `${verifier}\n`, { mode: 0o600, flag: 'w' });
fs.chmodSync(out, 0o600);
process.stdout.write('Wrote the password verifier. The password and verifier were not printed.\n');
