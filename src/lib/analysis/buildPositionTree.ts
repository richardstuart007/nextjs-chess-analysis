'use server'

import { Chess } from 'chess.js'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'
import { table_query } from 'nextjs-shared/table_query'

const ROW_CHUNK = 500   // rows per bulk INSERT (keeps params well under PG limit)

interface GameRecord {
  grid:          number
  player:        string
  playerColor:   'w' | 'b'
  pgn:           string
  result:        string
  chesscom_uuid: string
}

interface PositionRecord {
  gameRef:      string
  player:       string
  posFen:       string
  movePlayed:   string
  moveUci:      string | null
  resultingFen: string | null
  moveNum:      number
  result:       string
  color:        string
  depthAvg:     number
}

//----------------------------------------------------------------------------------
//  getPositionsFromGame — pure chess.js, no DB, returns all recordable positions
//----------------------------------------------------------------------------------
function getPositionsFromGame(
  game: GameRecord,
  minHalfMove: number,
  maxHalfMove: number
): PositionRecord[] {
  if (!game.pgn) return []

  const chess = new Chess()
  try { chess.loadPgn(game.pgn) } catch { return [] }

  const history  = chess.history({ verbose: true })
  const replay   = new Chess()
  const records: PositionRecord[] = []
  const seenFens = new Set<string>()

  for (let i = 0; i < Math.min(history.length, maxHalfMove); i++) {
    const fen   = replay.fen()
    const color = replay.turn()
    const move  = history[i]
    const moveUci = move.lan ?? (move.from + move.to + (move.promotion ?? ''))
    replay.move(move.san)
    const resultingFen = replay.fen()

    if (i >= minHalfMove && color === game.playerColor && !seenFens.has(fen)) {
      seenFens.add(fen)
      records.push({
        gameRef:      game.chesscom_uuid,
        player:       game.player,
        posFen:       fen,
        movePlayed:   move.san,
        moveUci,
        resultingFen,
        moveNum:      Math.ceil((i + 1) / 2),
        result:       game.result,
        color,
        depthAvg:     i + 1
      })
    }
  }

  // Sentinel: game too short — marks it as processed so the NOT EXISTS skip fires
  if (records.length === 0) {
    records.push({
      gameRef:      game.chesscom_uuid,
      player:       game.player,
      posFen:       '__too_short__',
      movePlayed:   '',
      moveUci:      null,
      resultingFen: null,
      moveNum:      0,
      result:       game.result,
      color:        '',
      depthAvg:     0
    })
  }

  return records
}

//----------------------------------------------------------------------------------
//  bulkInsertGamePositions — one INSERT per ROW_CHUNK rows, ON CONFLICT DO NOTHING
//----------------------------------------------------------------------------------
async function bulkInsertGamePositions(db: any, records: PositionRecord[]): Promise<void> {
  for (let start = 0; start < records.length; start += ROW_CHUNK) {
    const chunk  = records.slice(start, start + ROW_CHUNK)
    const values = chunk.map((_, i) => {
      const b = i * 8
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`
    }).join(',')
    const params = chunk.flatMap(r => [
      r.gameRef, r.player, r.posFen, r.movePlayed,
      r.moveUci, r.resultingFen, r.moveNum, r.result
    ])
    await db.query({
      caller:       'bulkInsertGamePositions',
      query:        `
        INSERT INTO tgam_game_positions
          (gam_game_ref, gam_player, gam_pos_fen, gam_move_played,
           gam_move_uci, gam_resulting_fen, gam_move_num, gam_result)
        VALUES ${values}
        ON CONFLICT (gam_game_ref, gam_player, gam_pos_fen) DO NOTHING
      `,
      params,
      functionName: 'buildPositionTree'
    })
  }
}

//----------------------------------------------------------------------------------
//  bulkEnsurePositions — insert new unique FENs into tpos_positions
//----------------------------------------------------------------------------------
async function bulkEnsurePositions(db: any, records: PositionRecord[]): Promise<void> {
  const fenMap = new Map<string, { color: string; depthAvg: number }>()
  for (const r of records) {
    if (r.posFen === '__too_short__') continue
    if (!fenMap.has(r.posFen)) fenMap.set(r.posFen, { color: r.color, depthAvg: r.depthAvg })
  }
  if (fenMap.size === 0) return

  const entries = [...fenMap.entries()]
  for (let start = 0; start < entries.length; start += ROW_CHUNK) {
    const chunk  = entries.slice(start, start + ROW_CHUNK)
    const values = chunk.map((_, i) => {
      const b = i * 3
      return `($${b+1},$${b+2},$${b+3},0)`
    }).join(',')
    const params = chunk.flatMap(([fen, v]) => [fen, v.color, v.depthAvg])
    await db.query({
      caller:       'bulkEnsurePositions',
      query:        `
        INSERT INTO tpos_positions (pos_fen, pos_color, pos_depth_avg, pos_reached)
        VALUES ${values}
        ON CONFLICT (pos_fen) DO NOTHING
      `,
      params,
      functionName: 'buildPositionTree'
    })
  }
}

//----------------------------------------------------------------------------------
//  recomputePosReached — accurate count from tgam_game_positions
//----------------------------------------------------------------------------------
async function recomputePosReached(fens: string[]): Promise<void> {
  const unique = [...new Set(fens.filter(f => f !== '__too_short__'))]
  for (let start = 0; start < unique.length; start += 1000) {
    const chunk = unique.slice(start, start + 1000)
    await table_query({
      caller: 'recomputePosReached',
      query:  `
        UPDATE tpos_positions p
        SET pos_reached = (
          SELECT COUNT(DISTINCT gam_game_ref)
          FROM tgam_game_positions
          WHERE gam_pos_fen = p.pos_fen
            AND gam_move_num > 0
        )
        WHERE p.pos_fen = ANY($1)
      `,
      params: [chunk as unknown as string]
    })
  }
}

//----------------------------------------------------------------------------------
//  buildPositionTree — main export
//----------------------------------------------------------------------------------
export async function buildPositionTree(opts: {
  limit?:          number
  playerUsername?: string
  dateFrom?:       string
  dateTo?:         string
  minMove?:        number
  maxMove?:        number
}): Promise<{
  gamesProcessed: number
  positions:      number
  errors:         number
  treeBuilt:      number
  remaining:      number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const limit       = opts.limit ?? 100
  const minMove     = opts.minMove ?? 6
  const maxMove     = opts.maxMove ?? 25
  const minHalfMove = (minMove - 1) * 2
  const maxHalfMove = maxMove * 2

  const params: any[]     = []
  const conditions: string[] = ['r.gr_pgn IS NOT NULL']

  conditions.push(`NOT EXISTS (
    SELECT 1 FROM tgam_game_positions
    WHERE gam_game_ref = r.gr_chesscom_uuid
      AND gam_player = r.gr_player_username
  )`)

  if (opts.playerUsername) {
    params.push(opts.playerUsername.toLowerCase())
    conditions.push(`r.gr_player_username = $${params.length}`)
  }
  if (opts.dateFrom) {
    params.push(Math.floor(new Date(opts.dateFrom).getTime() / 1000))
    conditions.push(`r.gr_end_time >= $${params.length}`)
  }
  if (opts.dateTo) {
    params.push(Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000))
    conditions.push(`r.gr_end_time <= $${params.length}`)
  }

  const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
  const whereClause = conditions.map(c => `(${c})`).join(' AND ')

  const gamesRes = await db.query({
    caller: 'buildPositionTree_fetch',
    query:  `
      SELECT
        r.gr_grid AS grid,
        r.gr_player_username AS player,
        r.gr_pgn AS pgn,
        r.gr_chesscom_uuid AS chesscom_uuid,
        CASE
          WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username THEN 'w'
          ELSE 'b'
        END AS player_color,
        CASE
          WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'white'->>'result' = 'win'  THEN 'win'
          WHEN LOWER(r.gr_raw_data->'black'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'black'->>'result' = 'win'  THEN 'win'
          WHEN LOWER(r.gr_raw_data->'white'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'black'->>'result' = 'win'  THEN 'loss'
          WHEN LOWER(r.gr_raw_data->'black'->>'username') = r.gr_player_username
               AND r.gr_raw_data->'white'->>'result' = 'win'  THEN 'loss'
          ELSE 'draw'
        END AS result
      FROM tgr_gamesraw r
      WHERE ${whereClause}
      ORDER BY r.gr_end_time DESC
      ${limitClause}
    `,
    params,
    functionName: 'buildPositionTree'
  })

  const games: GameRecord[] = gamesRes.rows.map((r: any) => ({
    grid:          r.grid,
    player:        r.player,
    playerColor:   r.player_color as 'w' | 'b',
    pgn:           r.pgn ?? '',
    result:        r.result,
    chesscom_uuid: r.chesscom_uuid
  }))

  const fromTs  = opts.dateFrom ? Math.floor(new Date(opts.dateFrom).getTime() / 1000)                   : 0
  const toTs    = opts.dateTo   ? Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)       : 9999999999
  const snapRes = await db.query({
    caller: 'buildPositionTree_snap',
    query:  `SELECT
      (SELECT COUNT(*) FROM (
         SELECT DISTINCT gp.gam_game_ref, gp.gam_player
         FROM tgam_game_positions gp
         JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
         WHERE r.gr_end_time >= $1 AND r.gr_end_time <= $2
       ) t) AS snap_processed,
      (SELECT COUNT(*) FROM tgr_gamesraw r
       WHERE r.gr_pgn IS NOT NULL
         AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         AND NOT EXISTS (
           SELECT 1 FROM tgam_game_positions
           WHERE gam_game_ref = r.gr_chesscom_uuid AND gam_player = r.gr_player_username
         )) AS snap_remaining`,
    params:       [fromTs, toTs],
    functionName: 'buildPositionTree'
  })
  const snapProcessed = parseInt(snapRes.rows[0].snap_processed ?? '0')
  const snapRemaining = parseInt(snapRes.rows[0].snap_remaining ?? '0')

  const t0    = Date.now()
  const logId = await startPipelineLog(2, 'Build Position Tree', games.length, snapProcessed, snapRemaining, opts.dateFrom, opts.dateTo)

  // Process all games in memory — pure chess.js, no DB
  let totalPositions = 0
  let errors         = 0
  const allRecords: PositionRecord[] = []

  for (const game of games) {
    try {
      const records = getPositionsFromGame(game, minHalfMove, maxHalfMove)
      allRecords.push(...records)
      totalPositions += records.filter(r => r.moveNum > 0).length
    } catch (err) {
      console.error(`buildPositionTree: chess.js error on game ${game.chesscom_uuid}`, err)
      errors++
    }
  }

  // Bulk insert into DB
  await bulkInsertGamePositions(db, allRecords)
  await bulkEnsurePositions(db, allRecords)
  await recomputePosReached(allRecords.map(r => r.posFen))

  const processed      = games.length - errors
  const afterRemaining = Math.max(0, snapRemaining - processed)
  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, snapProcessed + processed)

  return {
    gamesProcessed: games.length,
    positions:      totalPositions,
    errors,
    treeBuilt:      snapProcessed + processed,
    remaining:      afterRemaining
  }
}
