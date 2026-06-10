'use server'

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { saveEvaluation } from './chessdb'
import { startPipelineLog, completePipelineLog } from '../actions/pipelineLog'

//----------------------------------------------------------------------------------
//  StockfishProcess — wraps the native binary with UCI protocol
//----------------------------------------------------------------------------------
class StockfishProcess {
  private proc: ReturnType<typeof spawn>
  private pending: string[] = []
  private waiter: ((line: string) => void) | null = null

  constructor(binPath: string) {
    this.proc = spawn(binPath)
    const rl = createInterface({ input: this.proc.stdout as any })
    rl.on('line', (line: string) => {
      const t = line.trim()
      if (!t) return
      if (this.waiter) {
        const fn = this.waiter
        this.waiter = null
        fn(t)
      } else {
        this.pending.push(t)
      }
    })
  }

  send(cmd: string): void {
    this.proc.stdin?.write(cmd + '\n')
  }

  nextLine(): Promise<string> {
    if (this.pending.length > 0) return Promise.resolve(this.pending.shift()!)
    return new Promise(resolve => { this.waiter = resolve })
  }

  async init(): Promise<void> {
    this.send('uci')
    while ((await this.nextLine()) !== 'uciok') {}
    this.send('setoption name Threads value 4')
    this.send('isready')
    while ((await this.nextLine()) !== 'readyok') {}
  }

  async evaluate(fen: string, depth: number): Promise<{ cp: number; bestMove: string | null }> {
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
    let cp = 0
    let bestMove: string | null = null
    let line = ''
    do {
      line = await this.nextLine()
      if (line.includes('score cp')) {
        const m = line.match(/score cp (-?\d+)/)
        if (m) cp = parseInt(m[1])
      } else if (line.includes('score mate')) {
        const m = line.match(/score mate (-?\d+)/)
        if (m) {
          const mateIn = parseInt(m[1])
          cp = mateIn > 0 ? 10000 - Math.abs(mateIn) : -10000 + Math.abs(mateIn)
        }
      } else if (line.startsWith('bestmove')) {
        const parts = line.split(' ')
        bestMove = parts[1] ?? null
      }
    } while (!line.startsWith('bestmove'))
    return { cp, bestMove }
  }

  quit(): void {
    try { this.send('quit') } catch {}
    try { this.proc.kill() }  catch {}
  }
}

//----------------------------------------------------------------------------------
//  enrichPositionsStockfish — server-side batch position evaluation using native binary.
//  Reads tpos_positions (unevaluated), writes teva_evaluations.
//----------------------------------------------------------------------------------
async function countRemainingPositions(dateFrom?: string, dateTo?: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'enrichPositionsStockfish_count',
      query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
        LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
        WHERE e.eva_id IS NULL
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
            WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
          )`,
      params: [fromTs, toTs],
      functionName: 'enrichPositionsStockfish'
    })
    return parseInt(res.rows[0]?.cnt ?? '0')
  }
  const res = await db.query({
    caller: 'enrichPositionsStockfish_count',
    query: `SELECT COUNT(*) AS cnt FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE e.eva_id IS NULL`,
    params: [],
    functionName: 'enrichPositionsStockfish'
  })
  return parseInt(res.rows[0]?.cnt ?? '0')
}

async function countEvaluatedPositions(dateFrom?: string, dateTo?: string): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    const res = await db.query({
      caller: 'enrichPositionsStockfish_countEval',
      query: `SELECT COUNT(*) AS cnt FROM teva_evaluations e
        WHERE eva_move_san IS NULL
          AND EXISTS (
            SELECT 1 FROM tgam_game_positions gp
            JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
            WHERE gp.gam_pos_fen = e.eva_pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
          )`,
      params: [fromTs, toTs],
      functionName: 'enrichPositionsStockfish'
    })
    return parseInt(res.rows[0]?.cnt ?? '0')
  }
  const res = await db.query({
    caller: 'enrichPositionsStockfish_countEval',
    query:  `SELECT COUNT(*) AS cnt FROM teva_evaluations WHERE eva_move_san IS NULL`,
    params: [],
    functionName: 'enrichPositionsStockfish'
  })
  return parseInt(res.rows[0]?.cnt ?? '0')
}

async function getResultingFensToEvaluate(limit: number, dateFrom?: string, dateTo?: string): Promise<string[]> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const params: (string | number)[] = []
  let dateFilter = ''
  if (dateFrom && dateTo) {
    const fromTs = Math.floor(new Date(dateFrom).getTime() / 1000)
    const toTs   = Math.floor(new Date(dateTo + 'T23:59:59').getTime() / 1000)
    params.push(fromTs, toTs)
    dateFilter = `AND EXISTS (
      SELECT 1 FROM tgam_game_positions gp2
      JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp2.gam_game_ref AND r.gr_player_username = gp2.gam_player
      WHERE gp2.gam_resulting_fen = gp.gam_resulting_fen
        AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
    )`
  }
  if (limit > 0) params.push(limit)
  const res = await db.query({
    caller: 'getResultingFensToEvaluate',
    query: `
      SELECT DISTINCT gam_resulting_fen AS fen
      FROM tgam_game_positions gp
      WHERE gam_resulting_fen IS NOT NULL
        AND gam_resulting_fen != ''
        AND NOT EXISTS (
          SELECT 1 FROM teva_evaluations WHERE eva_pos_fen = gam_resulting_fen AND eva_move_san IS NULL
        )
        ${dateFilter}
      ${limit > 0 ? `LIMIT $${params.length}` : ''}
    `,
    params,
    functionName: 'getResultingFensToEvaluate'
  })
  return res.rows.map((r: any) => r.fen as string)
}

async function bulkUpdateCpLoss(): Promise<number> {
  const { sql } = await import('nextjs-shared/db')
  const db = await sql()
  const res = await db.query({
    caller: 'bulkUpdateCpLoss',
    query: `
      UPDATE tgam_game_positions gp
      SET gam_cp_loss =
        CASE WHEN p.pos_color = 'w'
          THEN e_after.eva_cp  - e_before.eva_cp
          ELSE e_before.eva_cp - e_after.eva_cp
        END
      FROM tpos_positions p,
           teva_evaluations e_before,
           teva_evaluations e_after
      WHERE gp.gam_pos_fen      = p.pos_fen
        AND e_before.eva_pos_fen = gp.gam_pos_fen       AND e_before.eva_move_san IS NULL
        AND e_after.eva_pos_fen  = gp.gam_resulting_fen AND e_after.eva_move_san  IS NULL
        AND gp.gam_resulting_fen IS NOT NULL
        AND e_before.eva_cp IS NOT NULL
        AND e_after.eva_cp  IS NOT NULL
    `,
    params: [],
    functionName: 'bulkUpdateCpLoss'
  })
  return res.rowCount ?? 0
}

export async function enrichPositionsStockfish(opts: {
  limit?:    number
  depth?:    number
  dateFrom?: string
  dateTo?:   string
}): Promise<{ processed: number; errors: number; remaining: number }> {
  const binPath = process.env.STOCKFISH_PATH ?? ''
  if (!binPath) throw new Error('STOCKFISH_PATH env var not set — restart the dev server after adding it to .env.locallocal')

  const depth = opts.depth ?? 16
  const limit = opts.limit ?? 50

  const { sql } = await import('nextjs-shared/db')
  const db = await sql()

  // Phase 1 FENs — positions in tpos_positions not yet evaluated
  const posParams: (string | number)[] = []
  let posDatFilter = ''
  if (opts.dateFrom && opts.dateTo) {
    const fTs = Math.floor(new Date(opts.dateFrom).getTime() / 1000)
    const tTs = Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000)
    posParams.push(fTs, tTs)
    posDatFilter = `AND EXISTS (
      SELECT 1 FROM tgam_game_positions gp
      JOIN tgr_gamesraw r ON r.gr_chesscom_uuid = gp.gam_game_ref AND r.gr_player_username = gp.gam_player
      WHERE gp.gam_pos_fen = p.pos_fen AND r.gr_end_time >= $1 AND r.gr_end_time <= $2
    )`
  }
  if (limit > 0) posParams.push(limit)
  const posRes = await db.query({
    caller: 'enrichPositionsStockfish_phase1',
    query: `
      SELECT p.pos_fen, p.pos_color
      FROM tpos_positions p
      LEFT JOIN teva_evaluations e ON e.eva_pos_fen = p.pos_fen AND e.eva_move_san IS NULL
      WHERE e.eva_id IS NULL
        ${posDatFilter}
      ORDER BY p.pos_reached DESC
      ${limit > 0 ? `LIMIT $${posParams.length}` : ''}
    `,
    params: posParams,
    functionName: 'enrichPositionsStockfish'
  })
  const positions: Array<{ fen: string; color: string | null }> =
    posRes.rows.map((r: any) => ({ fen: r.pos_fen as string, color: (r.pos_color ?? null) as string | null }))

  // Phase 2 FENs — resulting FENs not yet evaluated
  const resultingFens = await getResultingFensToEvaluate(limit, opts.dateFrom, opts.dateTo)

  const allFensToEval: Array<{ fen: string; color: string | null }> = [
    ...positions,
    ...resultingFens.map(fen => ({ fen, color: null }))
  ]

  if (allFensToEval.length === 0) {
    // No positions to evaluate — still run CP loss update in case new data exists
    await bulkUpdateCpLoss()
    return { processed: 0, errors: 0, remaining: 0 }
  }

  const [evaluatedBefore, remainingBefore] = await Promise.all([
    countEvaluatedPositions(opts.dateFrom, opts.dateTo),
    countRemainingPositions(opts.dateFrom, opts.dateTo)
  ])

  const sf = new StockfishProcess(binPath)
  await sf.init()

  let processed = 0
  let errors    = 0
  const t0      = Date.now()
  const logId   = await startPipelineLog(4, 'Evaluate Positions', allFensToEval.length, evaluatedBefore, remainingBefore, opts.dateFrom, opts.dateTo)

  for (const item of allFensToEval) {
    try {
      const { cp: rawCp, bestMove } = await sf.evaluate(item.fen, depth)
      // Normalize to white's perspective: Stockfish reports from side-to-move perspective.
      // For resulting FENs (color=null) the FEN encodes whose turn it is — parse it.
      const fenColor = item.color ?? item.fen.split(' ')[1] ?? 'w'
      const whiteCp = fenColor === 'b' ? -rawCp : rawCp
      await saveEvaluation({
        posFen:   item.fen,
        moveSan:  null,
        cp:       whiteCp,
        mate:     null,
        bestMove: bestMove ?? null,
        depth
      })
      processed++
    } catch (err) {
      console.error(`enrichPositionsStockfish: error on FEN`, err)
      errors++
    }
  }

  sf.quit()

  // Phase 3: bulk update gam_cp_loss now that both before and after evaluations exist
  await bulkUpdateCpLoss()

  await completePipelineLog(logId, processed, errors, 0, Date.now() - t0, evaluatedBefore + processed)
  const remaining = await countRemainingPositions()
  return { processed, errors, remaining }
}
