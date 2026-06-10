'use server'

import { getMovesForPosition, getEvaluationForPosition, updateGamePositionFlags } from './chessdb'

const HABIT_CP_THRESHOLD = 50

export async function detectMistakes(opts: { limit?: number }): Promise<{
  processed: number
  habitsFound: number
  improvementsFound: number
}> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  // Fetch game positions that don't yet have habit flags set
  const result = await db.query({
    caller: 'detectMistakes_fetch',
    query: `
      SELECT gam_id, gam_game_ref, gam_player, gam_pos_fen, gam_move_played, gam_move_num, gam_cp_loss
      FROM tgam_game_positions
      WHERE gam_is_habit IS NULL
      ORDER BY gam_id DESC
      ${(opts.limit ?? 0) > 0 ? `LIMIT ${opts.limit}` : ''}
    `,
    params: [],
    functionName: 'detectMistakes'
  })

  let habitsFound      = 0
  let improvementsFound = 0

  for (const row of result.rows) {
    const posFen      = row.gam_pos_fen as string
    const movePlayed  = row.gam_move_played as string
    const gameRef     = row.gam_game_ref as string

    // Get the player's most common move from this position
    const allMoves  = await getMovesForPosition(posFen)
    const habitMove = allMoves[0]  // highest mov_times

    if (!habitMove) {
      await updateGamePositionFlags({ gameRef, posFen, isHabit: false, isImproved: false })
      continue
    }

    // Get eval for the position (best cp) and the habit move cp
    const posEval      = await getEvaluationForPosition(posFen)
    const bestCp       = posEval?.eva_cp ?? null

    // Get eval specifically for the habit move
    const { sql: sqlFn } = await import('nextjs-shared/db')
    const db2 = await sqlFn()
    const habitEvalRes = await db2.query({
      caller: 'detectMistakes_habitEval',
      query: `SELECT eva_cp FROM teva_evaluations WHERE eva_pos_fen = $1 AND eva_move_san = $2`,
      params: [posFen, habitMove.mov_san],
      functionName: 'detectMistakes'
    })
    const habitCp = habitEvalRes.rows[0]?.eva_cp != null ? Number(habitEvalRes.rows[0].eva_cp) : null

    let cpLoss: number | null = null
    if (bestCp != null && habitCp != null) {
      cpLoss = Math.max(0, bestCp - habitCp)
    }

    const isHabit    = movePlayed === habitMove.mov_san && (cpLoss ?? 0) > HABIT_CP_THRESHOLD
    const isImproved = movePlayed !== habitMove.mov_san && (cpLoss ?? 0) > HABIT_CP_THRESHOLD

    await updateGamePositionFlags({ gameRef, posFen, isHabit, isImproved, cpLoss: cpLoss ?? undefined })

    if (isHabit)    habitsFound++
    if (isImproved) improvementsFound++
  }

  return {
    processed:         result.rows.length,
    habitsFound,
    improvementsFound
  }
}
