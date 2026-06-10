import { Client } from 'pg'
import { config } from 'dotenv'
import { parsePgnOpening } from '../src/lib/parsePgn'

config()

const POSTGRES_URL = process.env.POSTGRES_URL
const BATCH_SIZE = 1000

async function run() {
  if (!POSTGRES_URL) {
    console.error('POSTGRES_URL not set in .env')
    process.exit(1)
  }

  const client = new Client({ connectionString: POSTGRES_URL })
  await client.connect()
  console.log('Connected to database')

  try {
    const { rows: all } = await client.query(`
      SELECT gd_grid, gd_pgn
      FROM tgd_gamesdecon
      WHERE gd_opening_moves IS NULL
        AND gd_pgn IS NOT NULL
      ORDER BY gd_grid ASC
    `)

    const total = all.length
    if (total === 0) {
      console.log('Nothing to do — all games already have opening moves.')
      return
    }
    console.log(`Found ${total.toLocaleString()} games to backfill\n`)

    let updated = 0

    for (let start = 0; start < total; start += BATCH_SIZE) {
      const batch = all.slice(start, start + BATCH_SIZE)

      // Build a batch UPDATE using unnest for efficiency
      const grids: number[] = []
      const moves: string[] = []
      for (const row of batch) {
        grids.push(row.gd_grid)
        moves.push(parsePgnOpening(row.gd_pgn ?? ''))
      }

      await client.query(`
        UPDATE tgd_gamesdecon AS d
        SET gd_opening_moves = v.moves
        FROM (
          SELECT UNNEST($1::int[]) AS grid, UNNEST($2::text[]) AS moves
        ) AS v
        WHERE d.gd_grid = v.grid
      `, [grids, moves])

      updated += batch.length
      const pct = Math.round((updated / total) * 100)
      process.stdout.write(`\r${updated.toLocaleString()} / ${total.toLocaleString()}  (${pct}%)   `)
    }

    console.log(`\n\n✓ Done — ${updated.toLocaleString()} games backfilled.`)
  } finally {
    await client.end()
  }
}

run().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
