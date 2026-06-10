import { Client } from 'pg'
import { config } from 'dotenv'
import { parsePgnHeaders, parsePgnOpening } from '../src/lib/parsePgn'

config()

const USERNAME = (process.argv[2] ?? process.env.NEXT_PUBLIC_PRIMARY_USERNAME ?? 'stricade').toLowerCase()
const POSTGRES_URL = process.env.POSTGRES_URL
const BATCH_SIZE = 500
const COLS = 18

function normalizeTermination(raw: string | undefined): string {
  if (!raw) return ''
  const t = raw.toLowerCase()
  if (t.includes('won by resignation'))    return 'Resignation'
  if (t.includes('won on time'))           return 'Time'
  if (t.includes('won by checkmate'))      return 'Checkmate'
  if (t.includes('won - game abandoned'))  return 'Abandoned'
  if (t.includes('drawn by repetition'))   return 'Repetition'
  if (t.includes('drawn by timeout'))      return 'Timeout'
  if (t.includes('drawn by agreement'))    return 'Agreement'
  if (t.includes('drawn by insufficient')) return 'Insufficient'
  if (t.includes('drawn by stalemate'))    return 'Stalemate'
  if (t.includes('drawn by 50-move'))      return '50 Moves'
  return raw
}

async function run() {
  if (!POSTGRES_URL) {
    console.error('POSTGRES_URL not set in .env')
    process.exit(1)
  }

  const client = new Client({ connectionString: POSTGRES_URL })
  await client.connect()
  console.log(`Connected to database`)
  console.log(`Deconstructing games for: ${USERNAME}\n`)

  try {
    const { rows: rawGames } = await client.query(`
      SELECT r.*
      FROM tgr_gamesraw r
      WHERE r.gr_player_username = $1
        AND r.gr_time_class = 'blitz'
        AND NOT EXISTS (
          SELECT 1 FROM tgd_gamesdecon d WHERE d.gd_grid = r.gr_grid
        )
      ORDER BY r.gr_end_time ASC
    `, [USERNAME])

    const total = rawGames.length
    if (total === 0) {
      console.log('Nothing to do — all games already deconstructed.')
      return
    }
    console.log(`Found ${total.toLocaleString()} games to process\n`)

    let processed = 0
    let skipped = 0
    let errors = 0
    const ecoSeen = new Set<string>()

    for (let start = 0; start < total; start += BATCH_SIZE) {
      const batch = rawGames.slice(start, start + BATCH_SIZE)
      const deconRows: any[] = []
      const ecoRows: { code: string; name: string }[] = []

      for (const row of batch) {
        try {
          const rawData = typeof row.gr_raw_data === 'string'
            ? JSON.parse(row.gr_raw_data)
            : row.gr_raw_data

          const pgn = rawData.pgn
          if (!pgn) { skipped++; continue }

          const headers = parsePgnHeaders(pgn)

          const whiteUsername = (rawData.white?.username ?? '').toLowerCase()
          const blackUsername = (rawData.black?.username ?? '').toLowerCase()
          const isWhite = whiteUsername === USERNAME
          const playerColor = isWhite ? 'white' : 'black'
          const playerSide = isWhite ? rawData.white : rawData.black
          const opponentSide = isWhite ? rawData.black : rawData.white

          let playerResult = 'draw'
          if (playerSide?.result === 'win') playerResult = 'win'
          else if (opponentSide?.result === 'win') playerResult = 'loss'

          deconRows.push([
            row.gr_grid,
            whiteUsername,
            blackUsername,
            rawData.white?.rating ?? 0,
            rawData.black?.rating ?? 0,
            USERNAME,
            playerColor,
            playerResult,
            isWhite ? blackUsername : whiteUsername,
            (isWhite ? rawData.black?.rating : rawData.white?.rating) ?? 0,
            rawData.time_class ?? '',
            headers.timeControl,
            rawData.rated ?? true,
            normalizeTermination(headers.termination),
            row.gr_end_time,
            headers.eco,
            headers.openingName,
            rawData.url ?? '',
            parsePgnOpening(pgn)
          ])

          if (headers.eco && headers.openingName) {
            const key = `${headers.eco}|${headers.openingName}`
            if (!ecoSeen.has(key)) {
              ecoSeen.add(key)
              ecoRows.push({ code: headers.eco, name: headers.openingName })
            }
          }
        } catch {
          errors++
        }
      }

      if (deconRows.length > 0) {
        const placeholders = deconRows
          .map((_, i) => `(${Array.from({ length: COLS + 1 }, (_, j) => `$${i * (COLS + 1) + j + 1}`).join(', ')})`)
          .join(', ')

        await client.query(`
          INSERT INTO tgd_gamesdecon (
            gd_grid,
            gd_white_username, gd_black_username,
            gd_white_rating, gd_black_rating,
            gd_player_username, gd_player_color, gd_player_result,
            gd_opponent_username, gd_opponent_rating,
            gd_time_class, gd_time_control,
            gd_is_rated, gd_termination,
            gd_end_time,
            gd_eco_code, gd_opening_name, gd_game_url,
            gd_opening_moves
          ) VALUES ${placeholders}
          ON CONFLICT (gd_grid) DO NOTHING
        `, deconRows.flat())

        processed += deconRows.length
      }

      if (ecoRows.length > 0) {
        const ecoPlaceholders = ecoRows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
        await client.query(`
          INSERT INTO tec_ecoreference (ec_eco_code, ec_opening_name)
          VALUES ${ecoPlaceholders}
          ON CONFLICT (ec_eco_code, ec_opening_name) DO NOTHING
        `, ecoRows.flatMap(r => [r.code, r.name]))
      }

      const pct = Math.round(((start + batch.length) / total) * 100)
      process.stdout.write(`\r${processed.toLocaleString()} / ${total.toLocaleString()}  (${pct}%)${errors > 0 ? `  errors=${errors}` : ''}   `)
    }

    console.log(`\n\n✓ Done — processed: ${processed.toLocaleString()}, skipped: ${skipped}, errors: ${errors}`)
  } finally {
    await client.end()
  }
}

run().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
