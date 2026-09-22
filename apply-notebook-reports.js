const fs = require('fs');
const { connect } = require('./db.js');
(async () => {
  const sql = fs.readFileSync(__dirname + '/notebook-reports-schema.sql', 'utf8');
  const c = await connect();
  try {
    await c.query(sql);
    const r = await c.query(`select column_name, is_nullable from information_schema.columns
      where table_name='work_reports' and column_name in ('agro_machine_id','agro_cropzone_id')`);
    console.table(r.rows);
    console.log('applied');
  } finally { await c.end(); }
})();
