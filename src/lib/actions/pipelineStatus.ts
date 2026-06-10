'use server'

//----------------------------------------------------------------------------------
//  getPipelineStatusForRange — same counts but filtered to a date window
//----------------------------------------------------------------------------------
export type PipelineStatusRange = {
  gamesraw:            number
  gamesdecon:          number
  enriched:            number
  enrichmentRemaining: number
  treeGamesProcessed:  number
  treeGamesRemaining:  number
}

export async function getPipelineStatusForRange(
  dateFrom: string,
  dateTo:   string
): Promise<PipelineStatusRange> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
  const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)

  const res = await db.query({
    caller: 'getPipelineStatusForRange',
    query: `
      SELECT
        (SELECT COUNT(*) FROM tgr_gamesraw
         WHERE gr_end_time >= $1 AND gr_end_time <= $2)                              AS gamesraw,
        (SELECT COUNT(*) FROM tgd_gamesdecon d
         JOIN tgr_gamesraw r ON r.gr_grid = d.gd_grid
         WHERE r.gr_end_time >= $1 AND r.gr_end_time <= $2)                          AS gamesdecon,
        (SELECT COUNT(*) FROM ten_enrichment e
         JOIN tgr_gamesraw r ON r.gr_grid = e.en_grid
         WHERE e.en_enriched = TRUE
           AND r.gr_end_time >= $1 AND r.gr_end_time <= $2)                          AS enriched,
        (SELECT COUNT(*) FROM tgr_gamesraw r
         LEFT JOIN ten_enrichment e
           ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
         WHERE (e.en_enid IS NULL OR e.en_enriched = FALSE)
           AND r.gr_end_time >= $1 AND r.gr_end_time <= $2)                          AS enrichment_remaining,
        (SELECT COUNT(*) FROM (
           SELECT DISTINCT gp.gam_game_ref, gp.gam_player
           FROM tgam_game_positions gp
           JOIN tgr_gamesraw r
             ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
           WHERE r.gr_end_time >= $1 AND r.gr_end_time <= $2
         ) t)                                                                        AS tree_games_processed,
        (SELECT COUNT(*) FROM tgr_gamesraw r
         WHERE r.gr_pgn IS NOT NULL
           AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
           AND NOT EXISTS (
             SELECT 1 FROM tgam_game_positions
             WHERE gam_game_ref = r.gr_chesscom_uuid
               AND gam_player = r.gr_player_username
           ))                                                                        AS tree_games_remaining
    `,
    params: [fromTs, toTs],
    functionName: 'getPipelineStatusForRange'
  })

  const r = res.rows[0]
  return {
    gamesraw:            parseInt(r.gamesraw             ?? '0'),
    gamesdecon:          parseInt(r.gamesdecon           ?? '0'),
    enriched:            parseInt(r.enriched             ?? '0'),
    enrichmentRemaining: parseInt(r.enrichment_remaining ?? '0'),
    treeGamesProcessed:  parseInt(r.tree_games_processed ?? '0'),
    treeGamesRemaining:  parseInt(r.tree_games_remaining ?? '0'),
  }
}

//----------------------------------------------------------------------------------
//  getPipelineStatus — single-query count of processed/remaining rows for all 5 steps
//----------------------------------------------------------------------------------
export type PipelineStatus = {
  gamesraw:             number
  gamesdecon:           number
  enriched:             number
  enrichmentRemaining:  number
  treeGamesProcessed:   number
  treeGamesRemaining:   number
  positions:            number
  gamePositions:        number
  evaluated:            number
  evaluationsRemaining: number
  insights:             number
  insightsRemaining:    number
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  const res = await db.query({
    caller: 'getPipelineStatus',
    query: `
      SELECT
        (SELECT COUNT(*) FROM tgr_gamesraw)                                          AS gamesraw,
        (SELECT COUNT(*) FROM tgd_gamesdecon)                                        AS gamesdecon,
        (SELECT COUNT(*) FROM ten_enrichment WHERE en_enriched = TRUE)               AS enriched,
        (SELECT COUNT(*) FROM tgr_gamesraw r
         LEFT JOIN ten_enrichment e
           ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
         WHERE e.en_enid IS NULL OR e.en_enriched = FALSE)                           AS enrichment_remaining,
        (SELECT COUNT(*) FROM (
           SELECT DISTINCT gam_game_ref, gam_player FROM tgam_game_positions
         ) t)                                                                        AS tree_games_processed,
        (SELECT COUNT(*) FROM tgr_gamesraw r
         WHERE r.gr_pgn IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM tgam_game_positions
             WHERE gam_game_ref = r.gr_chesscom_uuid
               AND gam_player = r.gr_player_username
           ))                                                                        AS tree_games_remaining,
        (SELECT COUNT(*) FROM tpos_positions)                                        AS positions,
        (SELECT COUNT(*) FROM tgam_game_positions)                                   AS game_positions,
        (SELECT COUNT(*) FROM teva_evaluations WHERE eva_move_san IS NULL)           AS evaluated,
        (SELECT COUNT(*) FROM tpos_positions p
         LEFT JOIN teva_evaluations e
           ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
         WHERE e.eva_id IS NULL)                                                     AS evaluations_remaining,
        (SELECT COUNT(*) FROM tins_insights)                                         AS insights,
        (SELECT COUNT(*) FROM tpos_positions p
         LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
         WHERE i.ins_id IS NULL
           AND EXISTS (
             SELECT 1 FROM teva_evaluations
             WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL
           ))                                                                        AS insights_remaining
    `,
    params: [],
    functionName: 'getPipelineStatus'
  })

  const r = res.rows[0]
  return {
    gamesraw:             parseInt(r.gamesraw             ?? '0'),
    gamesdecon:           parseInt(r.gamesdecon           ?? '0'),
    enriched:             parseInt(r.enriched             ?? '0'),
    enrichmentRemaining:  parseInt(r.enrichment_remaining ?? '0'),
    treeGamesProcessed:   parseInt(r.tree_games_processed ?? '0'),
    treeGamesRemaining:   parseInt(r.tree_games_remaining ?? '0'),
    positions:            parseInt(r.positions            ?? '0'),
    gamePositions:        parseInt(r.game_positions       ?? '0'),
    evaluated:            parseInt(r.evaluated            ?? '0'),
    evaluationsRemaining: parseInt(r.evaluations_remaining ?? '0'),
    insights:             parseInt(r.insights             ?? '0'),
    insightsRemaining:    parseInt(r.insights_remaining   ?? '0'),
  }
}

//----------------------------------------------------------------------------------
//  Per-step refresh functions — each queries only that step's tables
//----------------------------------------------------------------------------------

export async function refreshStep1(dateFrom: string, dateTo: string): Promise<{
  allRaw: number; allDecon: number; rangeRaw: number; rangeDecon: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const fTs = Math.floor(new Date(dateFrom).getTime() / 1000)
  const tTs = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
  const res = await db.query({
    caller: 'refreshStep1', params: [fTs, tTs], functionName: 'refreshStep1',
    query: `SELECT
      (SELECT COUNT(*) FROM tgr_gamesraw)                                         AS all_raw,
      (SELECT COUNT(*) FROM tgd_gamesdecon)                                        AS all_decon,
      (SELECT COUNT(*) FROM tgr_gamesraw WHERE gr_end_time >= $1 AND gr_end_time <= $2) AS range_raw,
      (SELECT COUNT(*) FROM tgd_gamesdecon d
       JOIN tgr_gamesraw r ON r.gr_grid = d.gd_grid
       WHERE r.gr_end_time >= $1 AND r.gr_end_time <= $2)                          AS range_decon`
  })
  const r = res.rows[0]
  return { allRaw: parseInt(r.all_raw ?? '0'), allDecon: parseInt(r.all_decon ?? '0'), rangeRaw: parseInt(r.range_raw ?? '0'), rangeDecon: parseInt(r.range_decon ?? '0') }
}

export async function refreshStep2(dateFrom: string, dateTo: string): Promise<{
  allEnriched: number; allRemaining: number; rangeEnriched: number; rangeRemaining: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const fTs = Math.floor(new Date(dateFrom).getTime() / 1000)
  const tTs = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
  const res = await db.query({
    caller: 'refreshStep2', params: [fTs, tTs], functionName: 'refreshStep2',
    query: `SELECT
      (SELECT COUNT(*) FROM ten_enrichment WHERE en_enriched = TRUE)               AS all_enriched,
      (SELECT COUNT(*) FROM tgr_gamesraw r
       LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
       WHERE e.en_enid IS NULL OR e.en_enriched = FALSE)                           AS all_remaining,
      (SELECT COUNT(*) FROM ten_enrichment e
       JOIN tgr_gamesraw r ON r.gr_grid = e.en_grid
       WHERE e.en_enriched = TRUE AND r.gr_end_time >= $1 AND r.gr_end_time <= $2) AS range_enriched,
      (SELECT COUNT(*) FROM tgr_gamesraw r
       LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
       WHERE (e.en_enid IS NULL OR e.en_enriched = FALSE)
         AND r.gr_end_time >= $1 AND r.gr_end_time <= $2)                          AS range_remaining`
  })
  const r = res.rows[0]
  return { allEnriched: parseInt(r.all_enriched ?? '0'), allRemaining: parseInt(r.all_remaining ?? '0'), rangeEnriched: parseInt(r.range_enriched ?? '0'), rangeRemaining: parseInt(r.range_remaining ?? '0') }
}

export async function refreshStep3(dateFrom: string, dateTo: string): Promise<{
  allProcessed: number; allRemaining: number; allPositions: number
  rangeProcessed: number; rangeRemaining: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db  = await sql()
  const fTs = Math.floor(new Date(dateFrom).getTime() / 1000)
  const tTs = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
  const res = await db.query({
    caller: 'refreshStep3', params: [fTs, tTs], functionName: 'refreshStep3',
    query: `SELECT
      (SELECT COUNT(*) FROM (SELECT DISTINCT gam_game_ref, gam_player FROM tgam_game_positions) t) AS all_processed,
      (SELECT COUNT(*) FROM tgr_gamesraw r
       WHERE r.gr_pgn IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM tgam_game_positions
           WHERE gam_game_ref = r.gr_chesscom_uuid AND gam_player = r.gr_player_username)) AS all_remaining,
      (SELECT COUNT(*) FROM tpos_positions)                                         AS all_positions,
      (SELECT COUNT(*) FROM (
         SELECT DISTINCT gp.gam_game_ref, gp.gam_player FROM tgam_game_positions gp
         JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
         WHERE r.gr_end_time >= $1 AND r.gr_end_time <= $2) t)                     AS range_processed,
      (SELECT COUNT(*) FROM tgr_gamesraw r
       WHERE r.gr_pgn IS NOT NULL
         AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         AND NOT EXISTS (SELECT 1 FROM tgam_game_positions
           WHERE gam_game_ref = r.gr_chesscom_uuid AND gam_player = r.gr_player_username)) AS range_remaining`
  })
  const r = res.rows[0]
  return {
    allProcessed: parseInt(r.all_processed ?? '0'), allRemaining: parseInt(r.all_remaining ?? '0'), allPositions: parseInt(r.all_positions ?? '0'),
    rangeProcessed: parseInt(r.range_processed ?? '0'), rangeRemaining: parseInt(r.range_remaining ?? '0')
  }
}

export async function refreshStep4(dateFrom?: string, dateTo?: string): Promise<{
  evaluated: number; remaining: number; rangeEvaluated: number; rangeRemaining: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db   = await sql()
  const fTs  = dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000)              : 0
  const tTs  = dateTo   ? Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000) : 0
  const res  = await db.query({
    caller: 'refreshStep4', params: [fTs, tTs], functionName: 'refreshStep4',
    query: `SELECT
      (SELECT COUNT(*) FROM teva_evaluations WHERE eva_move_san IS NULL)               AS evaluated,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
       WHERE e.eva_id IS NULL)                                                          AS remaining,
      (SELECT COUNT(*) FROM teva_evaluations e
       WHERE eva_move_san IS NULL
         AND EXISTS (
           SELECT 1 FROM tgam_game_positions gp
           JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
           WHERE gp.gam_pos_fen = e.eva_pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         ))                                                                             AS range_evaluated,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
       WHERE e.eva_id IS NULL
         AND EXISTS (
           SELECT 1 FROM tgam_game_positions gp
           JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
           WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         ))                                                                             AS range_remaining`
  })
  const r = res.rows[0]
  return {
    evaluated:      parseInt(r.evaluated       ?? '0'),
    remaining:      parseInt(r.remaining       ?? '0'),
    rangeEvaluated: parseInt(r.range_evaluated ?? '0'),
    rangeRemaining: parseInt(r.range_remaining ?? '0'),
  }
}

export async function refreshStep5(dateFrom?: string, dateTo?: string): Promise<{
  insights: number; remaining: number; rangeInsights: number; rangeRemaining: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db   = await sql()
  const fTs  = dateFrom ? Math.floor(new Date(dateFrom).getTime() / 1000)              : 0
  const tTs  = dateTo   ? Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000) : 0
  const res  = await db.query({
    caller: 'refreshStep5', params: [fTs, tTs], functionName: 'refreshStep5',
    query: `SELECT
      (SELECT COUNT(*) FROM tins_insights)                                               AS insights,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
       WHERE i.ins_id IS NULL
         AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL)
      )                                                                                  AS remaining,
      (SELECT COUNT(*) FROM tins_insights i
       WHERE EXISTS (
         SELECT 1 FROM tgam_game_positions gp
         JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
         WHERE gp.gam_pos_fen = i.ins_pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
       ))                                                                                AS range_insights,
      (SELECT COUNT(*) FROM tpos_positions p
       LEFT JOIN tins_insights i ON i.ins_pos_fen = p.pos_fen
       WHERE i.ins_id IS NULL
         AND EXISTS (SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = p.pos_fen AND eva_move_san IS NULL)
         AND EXISTS (
           SELECT 1 FROM tgam_game_positions gp
           JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
           WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
         ))                                                                              AS range_remaining`
  })
  const r = res.rows[0]
  return {
    insights:      parseInt(r.insights       ?? '0'),
    remaining:     parseInt(r.remaining      ?? '0'),
    rangeInsights: parseInt(r.range_insights ?? '0'),
    rangeRemaining:parseInt(r.range_remaining?? '0'),
  }
}
