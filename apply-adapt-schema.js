// Apply adapt-schema.sql. Same pattern as the other *-schema.sql files here:
// idempotent DDL (create table if not exists / add column if not exists), safe
// to re-run, and it prints the resulting state so the change is verifiable
// rather than assumed.
const fs = require('fs');
const { connect } = require('./db');

(async () => {
  const sql = fs.readFileSync(__dirname + '/adapt-schema.sql', 'utf8');
  const c = await connect();
  try {
    await c.query(sql);
    const { rows: t } = await c.query(
      `select relrowsecurity as rls from pg_class where relname = 'adapt_documents'`
    );
    console.log(`adapt_documents created — RLS enabled: ${t[0]?.rls}`);

    const { rows: s } = await c.query(
      `select name, activity_canonical, adapt_code from services order by sort_order`
    );
    console.log('\nservices:');
    for (const r of s) {
      console.log(`  ${r.name.padEnd(24)} ${r.adapt_code || '(none — needs a decision)'}`);
    }
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
