// Shared DB connector for admin scripts.
//
// The direct host (db.<ref>.supabase.co) is IPv6-ONLY — no A record — and this
// network's IPv6 routing is intermittent (EHOSTUNREACH mid-session). The
// Supabase pooler is reachable over IPv4, so prefer it and keep the direct
// host as a fallback. Region is ap-northeast-1 (Tokyo); the pooler username is
// postgres.<project-ref>, not plain postgres.
const { Client } = require('pg');
const dns = require('dns').promises;
const fs = require('fs');
const REF = 'fmlkyolptudqtofdnsjp';
const pw = fs.readFileSync(__dirname + '/.env.local', 'utf8').match(/SUPABASE_DB_PASSWORD=(.+)/)[1].trim();

async function tryClient(cfg) {
  const c = new Client({ ...cfg, password: pw, database: 'postgres',
                         ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  c.on('error', () => {});
  await c.connect();
  return c;
}

module.exports.connect = async function connect() {
  const attempts = [
    { host: `aws-0-ap-northeast-1.pooler.supabase.com`, port: 5432, user: `postgres.${REF}` },
  ];
  for (const a of attempts) {
    try { return await tryClient(a); } catch (e) { /* fall through */ }
  }
  // Fallback: direct host by resolved IPv6 literal.
  const [addr] = await dns.resolve6(`db.${REF}.supabase.co`);
  return tryClient({ host: addr, port: 5432, user: 'postgres' });
};
