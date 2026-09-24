const fs = require('fs');
const { connect } = require('./db.js');
(async () => {
  const c = await connect();
  try {
    await c.query(fs.readFileSync(__dirname + '/field-number-fn.sql', 'utf8'));
    // prove it works without consuming a number for real: claim then put it back
    const before = await c.query(`select id, next_field_number from farm_organizations order by id`);
    const r = await c.query(`select public.claim_next_field_number('HN') as n`);
    await c.query(`update farm_organizations set next_field_number = next_field_number - 1 where id='HN'`);
    const after = await c.query(`select id, next_field_number from farm_organizations order by id`);
    console.log('  claimed number for HN:', r.rows[0].n);
    console.log('  counters before:', JSON.stringify(before.rows));
    console.log('  counters after :', JSON.stringify(after.rows), '(rolled back)');
  } finally { await c.end(); }
})();
