const fs = require('fs');
const { connect } = require('./db.js');
(async () => {
  const c = await connect();
  try {
    await c.query(fs.readFileSync(__dirname + '/language-schema.sql', 'utf8'));
    console.table((await c.query(`select name, phone, role, language from app_users order by phone`)).rows);
    console.log('applied');
  } finally { await c.end(); }
})();
