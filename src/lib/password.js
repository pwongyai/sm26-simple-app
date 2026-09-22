import crypto from "crypto";

// Password hashing with Node's built-in scrypt.
//
// Deliberately not bcrypt/argon2: both are native addons that have to compile
// per platform, and scrypt is in Node's standard library, is memory-hard, and
// is what the crypto module recommends for passwords. One less dependency to
// break a Vercel build the week of a demo.
//
// Stored format:  scrypt$<N>$<r>$<p>$<salt hex>$<hash hex>
// The parameters travel with the hash, so they can be raised later without
// invalidating existing passwords — an old hash still verifies with its own.

const N = 16384; // CPU/memory cost
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

function derive(password, salt, { N: n = N, r = R, p = P } = {}) {
  return new Promise((resolve, reject) => {
    // maxmem must be raised above the default or scrypt throws at N=16384.
    crypto.scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    );
  });
}

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

// Constant-time verify. Returns false rather than throwing on a malformed or
// missing hash: a user with no password set must fail closed, not 500.
export async function verifyPassword(password, stored) {
  try {
    if (!password || !stored) return false;
    const [scheme, n, r, p, saltHex, keyHex] = String(stored).split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    const actual = await derive(password, salt, { N: Number(n), r: Number(r), p: Number(p) });

    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
