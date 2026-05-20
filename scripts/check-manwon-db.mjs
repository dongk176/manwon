import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL')
  process.exit(1)
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 10,
})

try {
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'manwon_happiness'
    order by table_name
  `
  const policies = await sql`
    select tablename, policyname
    from pg_policies
    where schemaname = 'manwon_happiness'
    order by tablename, policyname
  `
  console.log(
    JSON.stringify(
      {
        ok: true,
        tableCount: tables.length,
        policyCount: policies.length,
        tables: tables.map((row) => row.table_name),
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
