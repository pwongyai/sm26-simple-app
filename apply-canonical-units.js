// Apply canonical-units-schema.sql, showing before and after so the conversion
// is verifiable rather than assumed.
const fs = require('fs');
const { connect } = require('./db');

(async () => {
  const c = await connect();
  try {
    const before = await c.query(`
      select s.name, s.price_per_unit as price, s.contractor_agro_org_id,
             o.currency, o.area_unit, o.area_unit_m2
        from services s
        left join farm_contractor_relationships r
          on r.contractor_organization_id = s.contractor_agro_org_id and r.status = 'active'
        left join farm_organizations o on o.id = r.farm_organization_id
       order by s.contractor_agro_org_id, s.name`);
    console.log('BEFORE — services');
    for (const r of before.rows) {
      console.log(`  ${String(r.name).padEnd(24)} ${String(r.price).padStart(10)} ${r.currency}/${r.area_unit}`);
    }
    const wBefore = await c.query(
      `select field_name, crop_size_rai from work_orders where crop_size_rai is not null order by organization_id`);
    console.log('\nBEFORE — work orders');
    for (const r of wBefore.rows) console.log(`  ${String(r.field_name).padEnd(24)} ${r.crop_size_rai}`);

    await c.query(fs.readFileSync(__dirname + '/canonical-units-schema.sql', 'utf8'));

    const after = await c.query(`
      select s.name, s.price_per_m2_thb as price, o.currency, o.area_unit, o.area_unit_m2
        from services s
        left join farm_contractor_relationships r
          on r.contractor_organization_id = s.contractor_agro_org_id and r.status = 'active'
        left join farm_organizations o on o.id = r.farm_organization_id
       order by s.contractor_agro_org_id, s.name`);
    console.log('\nAFTER — services (stored THB/m², and what it renders back to)');
    for (const r of after.rows) {
      const back = Number(r.price) * Number(r.area_unit_m2) * (r.currency === 'VND' ? 800 : 1);
      console.log(`  ${String(r.name).padEnd(24)} ${String(r.price).padStart(12)} THB/m²  ->  ` +
                  `${Math.round(back).toLocaleString()} ${r.currency}/${r.area_unit}`);
    }
    const wAfter = await c.query(
      `select field_name, crop_size_m2 from work_orders where crop_size_m2 is not null order by organization_id`);
    console.log('\nAFTER — work orders (m²)');
    for (const r of wAfter.rows) console.log(`  ${String(r.field_name).padEnd(24)} ${r.crop_size_m2} m²`);
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
