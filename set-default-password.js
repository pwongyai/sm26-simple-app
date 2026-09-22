// Give every account the same starting password.
//
//   node set-default-password.js          accounts that have no password yet
//   node set-default-password.js --all    EVERY account, overwriting existing
//
// Prompts once, without echoing, and applies the hash to each account. The
// value is deliberately not written into this file or into a migration: the
// repository is not where a password belongs, even a shared demo one, and a
// default that is committed tends to survive into the deployment that matters.
//
// Set-one-account is `node set-password.js <phone>`.
const readline = require('readline');
const crypto = require('crypto');
const { connect } = require('./db');

// Must match src/lib/password.js — the app verifies what this writes.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function hash(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password, salt, KEYLEN,
      { N, r: R, p: P, maxmem: 256 * 1024 * 1024 },
      (err, key) =>
        err
          ? reject(err)
          : resolve(`scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${key.toString('hex')}`)
    );
  });
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = (s) => {
      if (s.includes(prompt)) rl.output.write(prompt);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const all = process.argv.includes('--all');
  const c = await connect();
  try {
    const { rows: targets } = await c.query(
      all
        ? 'select id, phone, name, role, organization_id from app_users order by organization_id, role, phone'
        : `select id, phone, name, role, organization_id from app_users
            where password_hash is null order by organization_id, role, phone`
    );

    if (!targets.length) {
      console.log('Every account already has a password. Use --all to reset them anyway.');
      return;
    }

    console.log(all
      ? `Resetting the password on ALL ${targets.length} accounts:\n`
      : `${targets.length} account(s) have no password yet:\n`);
    for (const u of targets) {
      console.log(`  ${u.phone}  ${String(u.role).padEnd(11)} ${String(u.name).padEnd(18)} ${u.organization_id}`);
    }
    console.log('');

    const pw = await askHidden('Password for all of the above: ');
    if (pw.length < 4) {
      console.error('Too short — at least 4 characters. Nothing changed.');
      process.exit(1);
    }
    const again = await askHidden('Repeat:                       ');
    if (pw !== again) {
      console.error('They do not match. Nothing changed.');
      process.exit(1);
    }

    // A separate hash per account: the same password must not produce the same
    // stored value twice, or the table itself shows which accounts share one.
    for (const u of targets) {
      await c.query('update app_users set password_hash = $1 where id = $2', [await hash(pw), u.id]);
    }

    const { rows } = await c.query(
      `select phone, name, (password_hash is not null) as has_pw
         from app_users order by organization_id, role, phone`
    );
    console.log(`\nSet on ${targets.length} account(s).\n`);
    for (const r of rows) {
      console.log(`  ${r.phone}  ${String(r.name).padEnd(18)} ${r.has_pw ? 'password set' : 'NO PASSWORD'}`);
    }
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
