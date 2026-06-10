import { Client } from 'pg'
import { config } from 'dotenv'

config()

const USERNAME = (process.argv[2] ?? process.env.NEXT_PUBLIC_PRIMARY_USERNAME ?? 'stricade').toLowerCase()
const POSTGRES_URL = process.env.POSTGRES_URL

async function run() {
  if (!POSTGRES_URL) {
    console.error('POSTGRES_URL not set in .env')
    process.exit(1)
  }

  const client = new Client({ connectionString: POSTGRES_URL })
  await client.connect()
  console.log(`Connected to database`)
  console.log(`Syncing games for: ${USERNAME}\n`)

  try {
    // Fetch archive list from Chess.com
    const archivesRes = await fetch(`https://api.chess.com/pub/player/${USERNAME}/games/archives`)
    if (!archivesRes.ok) throw new Error(`Failed to fetch archives (HTTP ${archivesRes.status})`)
    const { archives } = await archivesRes.json() as { archives: string[] }
    console.log(`Found ${archives.length} monthly archives — processing oldest first\n`)

    let totalInserted = 0
    let totalSkipped = 0

    for (let i = 0; i < archives.length; i++) {
      const archiveUrl = archives[i]
      const month = archiveUrl.match(/\/(\d{4}\/\d{2})$/)?.[1] ?? archiveUrl

      process.stdout.write(`[${i + 1}/${archives.length}] ${month} ... `)

      const monthRes = await fetch(archiveUrl)
      if (!monthRes.ok) {
        console.log(`FAILED (HTTP ${monthRes.status}) — skipping`)
        continue
      }

      const { games } = await monthRes.json() as { games: any[] }
      const standardGames = (games ?? [])
        .filter((g: any) => g.rules === 'chess' && g.pgn)
        .sort((a: any, b: any) => a.end_time - b.end_time)

      let inserted = 0
      let skipped = 0

      for (const game of standardGames) {
        const uuid = game.uuid || game.url
        if (!uuid) continue

        // ON CONFLICT DO NOTHING handles any duplicate safely
        const result = await client.query(
          `INSERT INTO tgr_gamesraw
             (gr_player_username, gr_chesscom_uuid, gr_raw_data, gr_pgn, gr_end_time, gr_time_class)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (gr_chesscom_uuid) DO NOTHING`,
          [USERNAME, uuid, JSON.stringify(game), game.pgn ?? null, game.end_time, game.time_class ?? '']
        )

        if (result.rowCount === 1) {
          inserted++
          totalInserted++
        } else {
          skipped++
          totalSkipped++
        }
      }

      console.log(`inserted=${inserted}  skipped=${skipped}  |  total=${totalInserted.toLocaleString()}`)
    }

    console.log(`\n✓ Sync complete — inserted: ${totalInserted.toLocaleString()}, skipped: ${totalSkipped.toLocaleString()}`)
  } finally {
    await client.end()
  }
}

run().catch(err => {
  console.error('Sync failed:', err)
  process.exit(1)
})
