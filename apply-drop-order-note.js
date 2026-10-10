const fs = require('fs');
const { connect } = require('./db.js');
(async () => {
  const c = await connect();
  try {
    // Refuse to destroy real data. If anyone has written a note since this
    // was decided, stop and say so rather than dropping it silently.
    const { rows } = await c.query(`select count(note) as used from work_orders`);
    if (Number(rows[0].used) > 0) {
      console.error(`  ${rows[0].used} work order(s) have a note — NOT dropping. Export them first.`);
      process.exit(1);
    }
    await c.query(fs.readFileSync(__dirname + '/drop-order-note.sql', 'utf8'));
    const { rows: left } = await c.query(
      `select count(*) as n from information_schema.columns
        where table_name='work_orders' and column_name='note'`);
    console.log('  notes in use before drop: 0');
    console.log('  note column remaining   :', left[0].n);
  } finally { await c.end(); }
})();
