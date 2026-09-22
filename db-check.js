// Print the live database structure and row counts.
//
//   node db-check.js            every table, every column
//   node db-check.js services   one table
//
// Exists so the schema can be audited at any time without asking anyone: what
// tables exist, what columns they have, how many rows, and whether row-level
// security is on. If a column appears here that nobody agreed to, that is the
// point — it should be obvious and it should be challenged.
const { connect } = require('./db');

(async () => {
  const only = process.argv[2] || null;
  const c = await connect();
  try {
    const { rows: tables } = await c.query(`
      select c.relname as name,
             c.relrowsecurity as rls,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
             pg_total_relation_size(c.oid) as bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and ($1::text is null or c.relname = $1)
       order by c.relname`, [only]);

    if (!tables.length) {
      console.error(only ? `No table called "${only}".` : 'No tables found.');
      process.exit(1);
    }

    let totalRows = 0;
    for (const t of tables) {
      const { rows: [{ n }] } = await c.query(`select count(*)::int as n from public."${t.name}"`);
      totalRows += n;

      const { rows: cols } = await c.query(`
        select column_name, data_type, is_nullable, column_default
          from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position`, [t.name]);

      const { rows: fks } = await c.query(`
        select kcu.column_name, ccu.table_name as ref
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name
          join information_schema.constraint_column_usage ccu
            on ccu.constraint_name = tc.constraint_name
         where tc.constraint_type = 'FOREIGN KEY' and tc.table_name = $1`, [t.name]);
      const fkBy = Object.fromEntries(fks.map((f) => [f.column_name, f.ref]));

      const { rows: pks } = await c.query(`
        select kcu.column_name
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name
         where tc.constraint_type = 'PRIMARY KEY' and tc.table_name = $1`, [t.name]);
      const pk = new Set(pks.map((p) => p.column_name));

      const kb = (t.bytes / 1024).toFixed(0);
      const rlsFlag = t.rls ? `RLS on${Number(t.policies) ? `, ${t.policies} policies` : ', deny-all'}` : 'RLS OFF';
      console.log(`\n${t.name}  —  ${n} rows, ${kb} kB, ${rlsFlag}`);

      for (const col of cols) {
        const type = col.data_type
          .replace('timestamp with time zone', 'timestamptz')
          .replace('character varying', 'text')
          .replace('double precision', 'float');
        const marks = [
          pk.has(col.column_name) ? 'PK' : '',
          fkBy[col.column_name] ? `FK->${fkBy[col.column_name]}` : '',
          col.is_nullable === 'NO' ? 'NOT NULL' : '',
          col.column_default ? `default ${String(col.column_default).slice(0, 24)}` : '',
        ].filter(Boolean).join('  ');
        console.log(`    ${col.column_name.padEnd(26)} ${type.padEnd(12)} ${marks}`);
      }
    }

    const { rows: [db] } = await c.query('select pg_database_size(current_database()) as bytes');
    console.log(`\n${tables.length} tables, ${totalRows} rows, ` +
                `${(db.bytes / 1048576).toFixed(1)} MB of the 500 MB free tier ` +
                `(${(db.bytes / 1048576 / 500 * 100).toFixed(1)}%)`);
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
