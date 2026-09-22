// Set a user's password.
//
//   node set-password.js 0800000010
//
// Prompts for the password without echoing it, hashes it with scrypt, and
// stores only the hash. The plaintext is never written to a file, never passed
// as an argument (which would land in shell history), and never printed.
//
// There is no self-service reset in the app, on purpose: the alternative is
// SMS, and A2P delivery into Vietnam is unreliable enough to be the thing that
// fails on demo day. Resetting a password is running this script.
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

// Reads a line without showing it. Overriding _writeToOutput is the standard
// readline trick: the prompt itself still prints, every other keystroke is
// swallowed, so nothing appears on screen or in a screen-share — which is
// exactly when someone is most likely to be setting a password.
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
  const phone = (process.argv[2] || '').replace(/[^0-9+]/g, '');
  if (!phone) {
    console.error('usage: node set-password.js <phone>');
    console.error('   eg: node set-password.js 0800000010');
    process.exit(1);
  }

  const c = await connect();
  try {
    const { rows } = await c.query(
      'select id, name, role, organization_id from app_users where phone = $1',
      [phone]
    );
    if (!rows.length) {
      console.error(`No account with phone ${phone}.`);
      process.exit(1);
    }
    const u = rows[0];
    console.log(`Setting password for ${u.name} — ${u.role}, ${u.organization_id}\n`);

    const pw = await askHidden('New password: ');
    if (pw.length < 4) {
      console.error('Too short — at least 4 characters. Nothing changed.');
      process.exit(1);
    }
    const again = await askHidden('Repeat:       ');
    if (pw !== again) {
      console.error('They do not match. Nothing changed.');
      process.exit(1);
    }

    await c.query('update app_users set password_hash = $1 where id = $2', [
      await hash(pw),
      u.id,
    ]);
    console.log(`\nDone. ${u.name} can now sign in with ${phone}.`);
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
