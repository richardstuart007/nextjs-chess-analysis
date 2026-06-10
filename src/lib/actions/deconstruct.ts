'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_count } from 'nextjs-shared/table_count'
import { parsePgnHeaders, parsePgnOpening } from '../parsePgn'
import { INCLUDED_TIME_CLASSES } from '../constants'

const RAW_TABLE = 'tgr_gamesraw'
const DECON_TABLE = 'tgd_gamesdecon'
const ECO_TABLE = 'tec_ecoreference'

function normalizeTermination(raw: string | undefined): string {
  if (!raw) return ''
  const t = raw.toLowerCase()
  if (t.includes('won by resignation'))   return 'Resignation'
  if (t.includes('won on time'))          return 'Time'
  if (t.includes('won by checkmate'))     return 'Checkmate'
  if (t.includes('won - game abandoned')) return 'Abandoned'
  if (t.includes('drawn by repetition'))   return 'Repetition'
  if (t.includes('drawn by timeout'))      return 'Timeout'
  if (t.includes('drawn by agreement'))    return 'Agreement'
  if (t.includes('drawn by insufficient')) return 'Insufficient'
  if (t.includes('drawn by stalemate'))    return 'Stalemate'
  if (t.includes('drawn by 50-move'))      return '50 Moves'
  return raw
}

/**
 * Get count of raw games not yet deconstructed
 */
export async function getUndeconstructedCount(playerUsername: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const inPlaceholders = INCLUDED_TIME_CLASSES.map((_, i) => `$${i + 2}`).join(', ')
  const result = await db.query({
    caller: 'getUndeconstructedCount',
    query: `SELECT COUNT(*) FROM ${RAW_TABLE} r WHERE r.gr_player_username = $1 AND r.gr_time_class IN (${inPlaceholders}) AND NOT EXISTS (SELECT 1 FROM ${DECON_TABLE} d WHERE d.gd_grid = r.gr_grid)`,
    params: [playerUsername.toLowerCase(), ...INCLUDED_TIME_CLASSES],
    functionName: 'getUndeconstructedCount'
  })
  return Number(result.rows[0].count)
}

/**
 * Get count of deconstructed games
 */
export async function getDeconstructedCount(playerUsername: string): Promise<number> {
  return table_count({
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player_username', value: playerUsername.toLowerCase() }],
    caller: 'getDeconstructedCount'
  })
}

/**
 * Deconstruct raw games into the deconstructed table
 * Processes the most recent N raw games that haven't been deconstructed yet
 */
export async function deconstructGames(
  playerUsername: string,
  limit: number
): Promise<{ processed: number; skipped: number; errors: number }> {
  const username = playerUsername.toLowerCase()

  // Fetch raw games not yet deconstructed, most recent first
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const inPlaceholders = INCLUDED_TIME_CLASSES.map((_, i) => `$${i + 2}`).join(', ')
  const result = await db.query({
    caller: 'deconstructGames',
    query: `SELECT r.* FROM ${RAW_TABLE} r WHERE r.gr_player_username = $1 AND r.gr_time_class IN (${inPlaceholders}) AND NOT EXISTS (SELECT 1 FROM ${DECON_TABLE} d WHERE d.gd_grid = r.gr_grid) ORDER BY r.gr_end_time DESC ${limitClause}`,
    params: [username, ...INCLUDED_TIME_CLASSES],
    functionName: 'deconstructGames'
  })

  const rawGames = result.rows
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const row of rawGames) {
    try {
      const rawData = typeof row.gr_raw_data === 'string'
        ? JSON.parse(row.gr_raw_data)
        : row.gr_raw_data

      const pgn = rawData.pgn
      if (!pgn) {
        skipped++
        continue
      }

      // Parse PGN headers
      const headers = parsePgnHeaders(pgn)

      // Determine player side
      const whiteUsername = (rawData.white?.username ?? '').toLowerCase()
      const blackUsername = (rawData.black?.username ?? '').toLowerCase()
      const isWhite = whiteUsername === username
      const playerColor = isWhite ? 'white' : 'black'

      // Determine result
      const playerSide = isWhite ? rawData.white : rawData.black
      const opponentSide = isWhite ? rawData.black : rawData.white
      let playerResult = 'draw'
      if (playerSide?.result === 'win') playerResult = 'win'
      else if (opponentSide?.result === 'win') playerResult = 'loss'

      // Insert deconstructed record
      await table_write({
        caller: 'deconstructGames',
        table: DECON_TABLE,
        columnValuePairs: [
          { column: 'gd_grid', value: row.gr_grid },
          { column: 'gd_white_username', value: whiteUsername },
          { column: 'gd_black_username', value: blackUsername },
          { column: 'gd_white_rating', value: rawData.white?.rating ?? 0 },
          { column: 'gd_black_rating', value: rawData.black?.rating ?? 0 },
          { column: 'gd_player_username', value: username },
          { column: 'gd_player_color', value: playerColor },
          { column: 'gd_player_result', value: playerResult },
          { column: 'gd_opponent_username', value: isWhite ? blackUsername : whiteUsername },
          { column: 'gd_opponent_rating', value: (isWhite ? rawData.black?.rating : rawData.white?.rating) ?? 0 },
          { column: 'gd_time_class', value: rawData.time_class ?? '' },
          { column: 'gd_time_control', value: headers.timeControl },
          { column: 'gd_is_rated', value: rawData.rated ?? true },
          { column: 'gd_termination', value: normalizeTermination(headers.termination) },
          { column: 'gd_end_time', value: row.gr_end_time },
          { column: 'gd_eco_code', value: headers.eco },
          { column: 'gd_opening_name', value: headers.openingName },
          { column: 'gd_game_url', value: rawData.url ?? '' },
          { column: 'gd_opening_moves', value: parsePgnOpening(pgn) }
        ]
      })

      // Upsert ECO reference (if we have both code and name)
      if (headers.eco && headers.openingName) {
        await upsertEcoReference(headers.eco, headers.openingName)
      }

      processed++
    } catch (err) {
      console.error(`Error deconstructing game ${row.gr_grid}:`, err)
      errors++
    }
  }

  return { processed, skipped, errors }
}

/**
 * Upsert an ECO code → opening name mapping
 */
async function upsertEcoReference(ecoCode: string, openingName: string) {
  // Check if this exact combo exists
  const existing = await table_fetch({
    caller: 'upsertEcoReference',
    table: ECO_TABLE,
    whereColumnValuePairs: [
      { column: 'ec_eco_code', value: ecoCode },
      { column: 'ec_opening_name', value: openingName }
    ],
    limit: 1
  })

  if (existing.length === 0) {
    try {
      await table_write({
        caller: 'upsertEcoReference',
        table: ECO_TABLE,
        columnValuePairs: [
          { column: 'ec_eco_code', value: ecoCode },
          { column: 'ec_opening_name', value: openingName }
        ]
      })
    } catch {
      // Ignore duplicate key errors (race condition)
    }
  }
}
