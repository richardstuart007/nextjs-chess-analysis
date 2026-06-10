import { sql } from 'nextjs-shared/db'
import DbToolsTabs from './_tabs'

export default async function DbToolsPage() {
  const db = await sql()
  const result = await db.query({
    query: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    params: [],
    functionName: 'DbToolsPage',
    caller: 'DbToolsPage',
  })
  const tables: string[] = result.rows.map((r: { tablename: string }) => r.tablename)
  return (
    <div className='mx-4 my-4 border border-gray-300 rounded-lg p-4'>
      <h1 className='text-xl font-bold text-gray-900 mb-2'>Database Tools</h1>
      <DbToolsTabs tables={tables} baseDir={process.cwd().replace(/\\/g, '/')} />
    </div>
  )
}
