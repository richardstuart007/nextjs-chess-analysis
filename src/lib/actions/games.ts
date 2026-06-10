'use server'

import { table_fetch } from 'nextjs-shared/table_fetch'
import { table_write } from 'nextjs-shared/table_write'
import { table_count } from 'nextjs-shared/table_count'

export type GameEvalRow = {
  san: string
  fen: string
  fenBefore: string
  cp: number
  cpBefore: number
  bestMove: string
  bestMoveSan: string
  bestLineSans: string[]
  cpLoss: number
  classification: string
  depth: number
}

const GAMES_TABLE = 'tgr_gamesraw'
const DECON_TABLE = 'tgd_gamesdecon'
const SAVED_TABLE = 'tsa_savedanalyses'

// -----------------------------------------------------------------------
// Games
// -----------------------------------------------------------------------

export async function getGameCount(playerUsername: string): Promise<number> {
  return table_count({
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player_username', value: playerUsername.toLowerCase() }],
    caller: 'getGameCount'
  })
}

export async function getRecentGames(playerUsername: string, limit: number = 100) {
  return table_fetch({
    caller: 'getRecentGames',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit
  })
}

export async function getGameById(gameId: number) {
  const rows = await table_fetch({
    caller: 'getGameById',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_grid', value: gameId }]
  })
  return rows[0] ?? null
}

export async function getLatestGameEndTime(playerUsername: string): Promise<number | null> {
  const rows = await table_fetch({
    caller: 'getLatestGameEndTime',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'gr_end_time DESC',
    limit: 1,
    columns: ['gr_end_time']
  })
  return rows[0]?.gr_end_time ?? null
}

export async function gameExists(chesscomUuid: string): Promise<boolean> {
  const rows = await table_fetch({
    caller: 'gameExists',
    table: GAMES_TABLE,
    whereColumnValuePairs: [{ column: 'gr_chesscom_uuid', value: chesscomUuid }],
    limit: 1,
    columns: ['gr_grid']
  })
  return rows.length > 0
}

export async function insertRawGame(data: {
  player_username: string
  chesscom_uuid: string
  raw_data: object
  pgn?: string | null
  end_time: number
  time_class: string
}) {
  return table_write({
    caller: 'insertRawGame',
    table: GAMES_TABLE,
    columnValuePairs: [
      { column: 'gr_player_username', value: data.player_username.toLowerCase() },
      { column: 'gr_chesscom_uuid', value: data.chesscom_uuid },
      { column: 'gr_raw_data', value: JSON.stringify(data.raw_data) },
      { column: 'gr_pgn', value: data.pgn ?? null },
      { column: 'gr_end_time', value: data.end_time },
      { column: 'gr_time_class', value: data.time_class }
    ]
  })
}

//----------------------------------------------------------------------------------
//  saveGameEvaluations — write per-move Stockfish evals from /analyze to tgev_game_evals
//----------------------------------------------------------------------------------
export async function saveGameEvaluations(gameRef: string, player: string, evaluations: GameEvalRow[]): Promise<void> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const lowerPlayer = player.toLowerCase()
  await db.query({
    caller: 'saveGameEvaluations_delete',
    query: 'DELETE FROM tgev_game_evals WHERE gev_game_ref = $1 AND gev_player = $2',
    params: [gameRef, lowerPlayer],
    functionName: 'saveGameEvaluations'
  })
  for (let i = 0; i < evaluations.length; i++) {
    const e = evaluations[i]
    await db.query({
      caller: 'saveGameEvaluations_insert',
      query: `INSERT INTO tgev_game_evals (
        gev_game_ref, gev_player, gev_move_num,
        gev_san, gev_fen_before, gev_fen_after,
        gev_cp, gev_cp_before, gev_cp_loss,
        gev_best_move, gev_best_move_san, gev_best_line,
        gev_classification, gev_depth
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      params: [
        gameRef, lowerPlayer, i,
        e.san, e.fenBefore, e.fen,
        e.cp, e.cpBefore, e.cpLoss,
        e.bestMove, e.bestMoveSan, JSON.stringify(e.bestLineSans),
        e.classification, e.depth
      ],
      functionName: 'saveGameEvaluations'
    })
  }
}

//----------------------------------------------------------------------------------
//  getGameEvals — fetch stored per-move evals from tgev_game_evals
//----------------------------------------------------------------------------------
export async function getGameEvals(gameRef: string, player: string): Promise<GameEvalRow[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const res = await db.query({
    caller: 'getGameEvals',
    query: `SELECT gev_san, gev_fen_after, gev_fen_before,
      gev_cp, gev_cp_before, gev_best_move, gev_best_move_san,
      gev_best_line, gev_cp_loss, gev_classification, gev_depth
      FROM tgev_game_evals
      WHERE gev_game_ref = $1 AND gev_player = $2
      ORDER BY gev_move_num`,
    params: [gameRef, player.toLowerCase()],
    functionName: 'getGameEvals'
  })
  return res.rows.map((r: any) => ({
    san:           r.gev_san,
    fen:           r.gev_fen_after,
    fenBefore:     r.gev_fen_before,
    cp:            r.gev_cp      ?? 0,
    cpBefore:      r.gev_cp_before ?? 0,
    bestMove:      r.gev_best_move    ?? '',
    bestMoveSan:   r.gev_best_move_san ?? '',
    bestLineSans:  Array.isArray(r.gev_best_line) ? r.gev_best_line : [],
    cpLoss:        r.gev_cp_loss ?? 0,
    classification: r.gev_classification ?? 'good',
    depth:         r.gev_depth ?? 0
  }))
}

// -----------------------------------------------------------------------
// Saved Analyses
// -----------------------------------------------------------------------

export async function saveAnalysisLine(data: {
  game_id?: number
  title: string
  notes?: string
  line_pgn: string
  line_moves: object[]
  starting_fen: string
  starting_ply: number
  eco_code?: string
  opening_name?: string
}) {
  return table_write({
    caller: 'saveAnalysisLine',
    table: SAVED_TABLE,
    columnValuePairs: [
      { column: 'sa_grid', value: data.game_id ?? 0 },
      { column: 'sa_save_type', value: 'line' },
      { column: 'sa_title', value: data.title },
      { column: 'sa_notes', value: data.notes ?? '' },
      { column: 'sa_line_pgn', value: data.line_pgn },
      { column: 'sa_line_moves', value: JSON.stringify(data.line_moves) },
      { column: 'sa_starting_fen', value: data.starting_fen },
      { column: 'sa_starting_ply', value: data.starting_ply },
      { column: 'sa_eco_code', value: data.eco_code ?? '' },
      { column: 'sa_opening_name', value: data.opening_name ?? '' }
    ]
  })
}

export async function saveAnalysisTree(data: {
  game_id?: number
  title: string
  notes?: string
  tree_data: object
}) {
  return table_write({
    caller: 'saveAnalysisTree',
    table: SAVED_TABLE,
    columnValuePairs: [
      { column: 'sa_grid', value: data.game_id ?? 0 },
      { column: 'sa_save_type', value: 'full_tree' },
      { column: 'sa_title', value: data.title },
      { column: 'sa_notes', value: data.notes ?? '' },
      { column: 'sa_tree_data', value: JSON.stringify(data.tree_data) }
    ]
  })
}

export async function getSavedAnalyses(gameId: number) {
  return table_fetch({
    caller: 'getSavedAnalyses',
    table: SAVED_TABLE,
    whereColumnValuePairs: [{ column: 'sa_grid', value: gameId }],
    orderBy: 'sa_id DESC'
  })
}

// -----------------------------------------------------------------------
// Deconstructed Games
// -----------------------------------------------------------------------

export async function getDeconGames(playerUsername: string, limit: number = 100) {
  return table_fetch({
    caller: 'getDeconGames',
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player_username', value: playerUsername.toLowerCase() }],
    orderBy: 'gd_end_time DESC',
    limit
  })
}

export async function getDeconGameCount(playerUsername: string): Promise<number> {
  return table_count({
    table: DECON_TABLE,
    whereColumnValuePairs: [{ column: 'gd_player_username', value: playerUsername.toLowerCase() }],
    caller: 'getDeconGameCount'
  })
}

// -----------------------------------------------------------------------
// Filtered + Paginated Deconstructed Games
// -----------------------------------------------------------------------

import { fetchFiltered } from 'nextjs-shared/fetchFiltered'
import { fetchTotalPages } from 'nextjs-shared/fetchTotalPages'
import type { Filter } from 'nextjs-shared/structures'

const ITEMS_PER_PAGE = 25

export type GameFilters = {
  opponent?: string
  opponentRatingMin?: number
  opponentRatingMax?: number
  result?: string
  color?: string
  timeClass?: string
  opening?: string
  eco?: string
  dateFrom?: string
  dateTo?: string
}

function buildFilters(username: string, filters: GameFilters): Filter[] {
  const result: Filter[] = [
    { column: 'gd_player_username', operator: '=', value: username.toLowerCase() }
  ]

  if (filters.opponent) {
    result.push({ column: 'gd_opponent_username', operator: 'LIKE', value: filters.opponent })
  }
  const ratingOverlap = filters.opponentRatingMin && filters.opponentRatingMax &&
    filters.opponentRatingMin > filters.opponentRatingMax
  if (!ratingOverlap) {
    if (filters.opponentRatingMin)
      result.push({ column: 'gd_opponent_rating', operator: '>=', value: filters.opponentRatingMin })
    if (filters.opponentRatingMax)
      result.push({ column: 'gd_opponent_rating', operator: '<=', value: filters.opponentRatingMax })
  }
  if (filters.result) {
    result.push({ column: 'gd_player_result', operator: '=', value: filters.result })
  }
  if (filters.color) {
    result.push({ column: 'gd_player_color', operator: '=', value: filters.color })
  }
  if (filters.timeClass) {
    result.push({ column: 'gd_time_class', operator: '=', value: filters.timeClass })
  }
  if (filters.opening) {
    result.push({ column: 'gd_opening_name', operator: 'LIKE', value: filters.opening })
  }
  if (filters.eco) {
    result.push({ column: 'gd_eco_code', operator: 'LIKE', value: filters.eco })
  }
  if (filters.dateFrom) {
    const unixFrom = Math.floor(new Date(filters.dateFrom).getTime() / 1000)
    result.push({ column: 'gd_end_time', operator: '>=', value: unixFrom })
  }
  if (filters.dateTo) {
    const unixTo = Math.floor(new Date(filters.dateTo + 'T23:59:59').getTime() / 1000)
    result.push({ column: 'gd_end_time', operator: '<=', value: unixTo })
  }

  return result
}

export async function fetchFilteredGames(
  username: string,
  filters: GameFilters,
  page: number,
  itemsPerPage: number = ITEMS_PER_PAGE
) {
  const filterArray = buildFilters(username, filters)
  const offset = (page - 1) * itemsPerPage

  return fetchFiltered({
    table: DECON_TABLE,
    filters: filterArray,
    orderBy: 'gd_end_time DESC',
    limit: itemsPerPage,
    offset,
    caller: 'fetchFilteredGames'
  })
}

export async function fetchFilteredGamePages(
  username: string,
  filters: GameFilters,
  itemsPerPage: number = ITEMS_PER_PAGE
): Promise<number> {
  const filterArray = buildFilters(username, filters)

  return fetchTotalPages({
    table: DECON_TABLE,
    filters: filterArray,
    items_per_page: itemsPerPage,
    caller: 'fetchFilteredGamePages'
  })
}

export async function fetchFilteredGameCount(
  username: string,
  filters: GameFilters
): Promise<number> {
  const filterArray = buildFilters(username, filters)
  // items_per_page=1 means ceil(count/1) = exact count
  return fetchTotalPages({
    table: DECON_TABLE,
    filters: filterArray,
    items_per_page: 1,
    caller: 'fetchFilteredGameCount'
  })
}

export async function getOpeningScores(
  username: string,
  color: 'white' | 'black' | 'both',
  minGames: number = 100,
  limit: number = 20,
  sortDir: 'ASC' | 'DESC' = 'DESC',
  dateFrom?: string,
  dateTo?: string
): Promise<{ eco_code: string; opening_name: string; games: number; score_pct: number }[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const params: (string | number)[] = [username.toLowerCase(), minGames]
  let colorFilter = ''
  if (color !== 'both') {
    params.push(color)
    colorFilter = ` AND gd_player_color = $${params.length}`
  }
  let dateFilter = ''
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    dateFilter += ` AND gd_end_time >= $${params.length}`
  }
  if (dateTo) {
    params.push(Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000))
    dateFilter += ` AND gd_end_time <= $${params.length}`
  }
  const result = await db.query({
    caller: 'getOpeningScores',
    query: `
      SELECT
        gd_eco_code,
        gd_opening_name,
        COUNT(*) AS games,
        ROUND(AVG(CASE
          WHEN gd_player_result = 'win'  THEN 100
          WHEN gd_player_result = 'draw' THEN 50
          ELSE 0
        END)) AS score_pct
      FROM tgd_gamesdecon
      WHERE gd_player_username = $1
        ${colorFilter}
        ${dateFilter}
      GROUP BY gd_eco_code, gd_opening_name
      HAVING COUNT(*) >= $2
      ORDER BY score_pct ${sortDir}
      ${limitClause}
    `,
    params,
    functionName: 'getOpeningScores'
  })
  return result.rows.map((r: any) => ({
    eco_code: r.gd_eco_code ?? '',
    opening_name: r.gd_opening_name ?? '',
    games: Number(r.games),
    score_pct: Number(r.score_pct)
  }))
}

export async function getTerminationStats(
  username: string,
  dateFrom?: string,
  dateTo?: string,
  color?: string
): Promise<{ termination: string; win: number; loss: number; draw: number; total: number }[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const params: (string | number)[] = [username.toLowerCase()]
  let filters = ''
  if (color) {
    params.push(color)
    filters += ` AND gd_player_color = $${params.length}`
  }
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    filters += ` AND gd_end_time >= $${params.length}`
  }
  if (dateTo) {
    params.push(Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000))
    filters += ` AND gd_end_time <= $${params.length}`
  }
  const result = await db.query({
    caller: 'getTerminationStats',
    query: `
      SELECT
        gd_termination AS termination,
        COUNT(*) FILTER (WHERE gd_player_result = 'win')  AS win,
        COUNT(*) FILTER (WHERE gd_player_result = 'loss') AS loss,
        COUNT(*) FILTER (WHERE gd_player_result = 'draw') AS draw,
        COUNT(*) AS total
      FROM tgd_gamesdecon
      WHERE gd_player_username = $1
        AND gd_termination IS NOT NULL
        AND gd_termination != ''
        ${filters}
      GROUP BY gd_termination
      ORDER BY total DESC
    `,
    params,
    functionName: 'getTerminationStats'
  })
  return result.rows.map((r: any) => ({
    termination: r.termination,
    win:   Number(r.win),
    loss:  Number(r.loss),
    draw:  Number(r.draw),
    total: Number(r.total)
  }))
}

export async function backfillOpeningMoves(
  username: string,
  batchSize: number = 500
): Promise<{ updated: number; remaining: number }> {
  const { sql } = await import('nextjs-shared/db')
  const { parsePgnOpening } = await import('../parsePgn')
  const db = await sql()

  const rows = await db.query({
    caller: 'backfillOpeningMoves',
    query: `SELECT gd_grid, gd_pgn FROM tgd_gamesdecon
            WHERE gd_player_username = $1
              AND gd_opening_moves IS NULL
              AND gd_pgn IS NOT NULL
            LIMIT $2`,
    params: [username.toLowerCase(), batchSize],
    functionName: 'backfillOpeningMoves'
  })

  for (const row of rows.rows) {
    const moves = parsePgnOpening(row.gd_pgn ?? '')
    await db.query({
      caller: 'backfillOpeningMoves_update',
      query: `UPDATE tgd_gamesdecon SET gd_opening_moves = $1 WHERE gd_grid = $2`,
      params: [moves, row.gd_grid],
      functionName: 'backfillOpeningMoves'
    })
  }

  const remaining = await db.query({
    caller: 'backfillOpeningMoves_count',
    query: `SELECT COUNT(*) FROM tgd_gamesdecon
            WHERE gd_player_username = $1
              AND gd_opening_moves IS NULL`,
    params: [username.toLowerCase()],
    functionName: 'backfillOpeningMoves'
  })

  return {
    updated: rows.rows.length,
    remaining: Number(remaining.rows[0]?.count ?? 0)
  }
}

export async function getEarliestGameDate(usernames: string[]): Promise<string | null> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const placeholders = usernames.map((_, i) => `$${i + 1}`).join(', ')
  const result = await db.query({
    caller: 'getEarliestGameDate',
    query: `SELECT MIN(gd_end_time) AS min_time FROM tgd_gamesdecon WHERE gd_player_username IN (${placeholders})`,
    params: usernames.map(u => u.toLowerCase()),
    functionName: 'getEarliestGameDate'
  })
  const minTime = result.rows[0]?.min_time
  if (!minTime) return null
  return new Date(Number(minTime) * 1000).toISOString().slice(0, 10)
}

export interface RatingDataPoint {
  date: string        // 'YYYY-MM' | 'YYYY-WW' | 'YYYY-MM-DD' depending on granularity
  avgRating: number
  games: number
}

export type RatingGranularity = 'month' | 'week' | 'day' | 'game'

export async function getPlayerRatingOverTime(
  username: string,
  timeClass?: string,
  granularity: RatingGranularity = 'month',
  dateFrom?: string,
  dateTo?: string
): Promise<RatingDataPoint[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const params: (string | number)[] = [username.toLowerCase()]
  let timeClassFilter = ''
  if (timeClass && timeClass !== '') {
    params.push(timeClass)
    timeClassFilter = `AND gd_time_class = $${params.length}`
  }
  let dateFilter = ''
  if (dateFrom) {
    params.push(Math.floor(new Date(dateFrom).getTime() / 1000))
    dateFilter += ` AND gd_end_time >= $${params.length}`
  }
  if (dateTo) {
    params.push(Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000))
    dateFilter += ` AND gd_end_time <= $${params.length}`
  }

  let query: string

  if (granularity === 'game') {
    query = `
      SELECT
        TO_CHAR(TO_TIMESTAMP(gd_end_time) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date,
        (CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END)::int AS avg_rating,
        1::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player_username = $1
        ${timeClassFilter}${dateFilter}
      ORDER BY gd_end_time ASC
    `
  } else if (granularity === 'day') {
    query = `
      SELECT
        TO_CHAR(TO_TIMESTAMP(gd_end_time), 'YYYY-MM-DD') AS date,
        ROUND(AVG(
          CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END
        ))::int AS avg_rating,
        COUNT(*)::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player_username = $1
        ${timeClassFilter}${dateFilter}
      GROUP BY TO_CHAR(TO_TIMESTAMP(gd_end_time), 'YYYY-MM-DD')
      ORDER BY 1
    `
  } else if (granularity === 'week') {
    query = `
      SELECT
        TO_CHAR(DATE_TRUNC('week', TO_TIMESTAMP(gd_end_time)), 'YYYY-MM-DD') AS date,
        ROUND(AVG(
          CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END
        ))::int AS avg_rating,
        COUNT(*)::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player_username = $1
        ${timeClassFilter}${dateFilter}
      GROUP BY DATE_TRUNC('week', TO_TIMESTAMP(gd_end_time))
      ORDER BY DATE_TRUNC('week', TO_TIMESTAMP(gd_end_time))
    `
  } else {
    query = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', TO_TIMESTAMP(gd_end_time)), 'YYYY-MM') AS date,
        ROUND(AVG(
          CASE WHEN gd_player_color = 'white' THEN gd_white_rating ELSE gd_black_rating END
        ))::int AS avg_rating,
        COUNT(*)::int AS games
      FROM tgd_gamesdecon
      WHERE gd_player_username = $1
        ${timeClassFilter}${dateFilter}
      GROUP BY DATE_TRUNC('month', TO_TIMESTAMP(gd_end_time))
      ORDER BY DATE_TRUNC('month', TO_TIMESTAMP(gd_end_time))
    `
  }

  const result = await db.query({ caller: 'getPlayerRatingOverTime', query, params, functionName: 'getPlayerRatingOverTime' })

  return result.rows.map((r: any) => ({
    date: r.date,
    avgRating: r.avg_rating,
    games: r.games
  }))
}
