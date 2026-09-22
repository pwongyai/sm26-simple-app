// Apply auth-password-schema.sql. Idempotent; safe to re-run.
const fs = require('fs');
const { connect } = require('./db');

(async () => {
  const c = await connect();
  try {
    await c.query(fs.readFileSync(__dirname + '/auth-password-schema.sql', 'utf8'));

    const { rows: u } = await c.query(
      `select phone, name, role, organization_id,
              (password_hash is not null) as has_password
         from app_users order by organization_id, role, phone`
    );
    console.log('accounts:');
    for (const r of u) {
      console.log(`  ${r.phone}  ${String(r.role).padEnd(11)} ${String(r.name).padEnd(18)} ` +
                  `${r.organization_id}  password ${r.has_password ? 'set' : 'NOT SET'}`);
    }

    const { rows: o } = await c.query(`select id, name, active, currency, area_unit from farm_organizations order by id`);
    console.log('\norganisations:');
    for (const r of o) console.log(`  ${r.id}  ${String(r.name).padEnd(34)} active=${r.active}  ${r.currency}/${r.area_unit}`);

    const { rows: s } = await c.query(
      `select contractor_agro_org_id, name, adapt_code from services order by contractor_agro_org_id, sort_order`
    );
    console.log('\nservices by contractor:');
    for (const r of s) console.log(`  ${r.contractor_agro_org_id.slice(0, 8)}…  ${String(r.name).padEnd(24)} ${r.adapt_code || '(none)'}`);
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
