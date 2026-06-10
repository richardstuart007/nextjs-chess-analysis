'use server'

import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { Chess } from 'chess.js'
import { saveStockfishResults } from './enrichGames'
import { getUnenrichedGames } from './chessdb'
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

  async evaluate(fen: string, depth: number): Promise<number> {
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send(`go depth ${depth}`)
    let cp = 0
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
      }
    } while (!line.startsWith('bestmove'))
    return cp
  }

  quit(): void {
    try { this.send('quit') } catch {}
    try { this.proc.kill() }  catch {}
  }
}

//----------------------------------------------------------------------------------
//  analyzeGame — mirrors WASM StockfishEngine.analyzeGame logic exactly:
//  evaluate N+1 positions, normalize to white's perspective, compute cpLoss per move
//----------------------------------------------------------------------------------
async function analyzeGame(
  sf: StockfishProcess,
  pgn: string,
  playerColor: string,
  depth: number
): Promise<Array<{ fen: string; cp: number; isPlayerMove: boolean }>> {
  const chess = new Chess()
  try { chess.loadPgn(pgn) } catch { return [] }

  const history = chess.history({ verbose: true })
  if (history.length === 0) return []

  // Build FEN list: position 0 = start, position i+1 = after move i
  const fens: string[] = []
  const replay = new Chess()
  fens.push(replay.fen())
  for (const mv of history) {
    replay.move(mv.san)
    fens.push(replay.fen())
  }

  // Evaluate every position, normalising to white's perspective
  const whiteCps: number[] = []
  for (let i = 0; i < fens.length; i++) {
    const rawCp = await sf.evaluate(fens[i], depth)
    const isWhiteToMove = i % 2 === 0
    whiteCps.push(isWhiteToMove ? rawCp : -rawCp)
  }

  // Compute cpLoss per move — same formula as WASM version
  const isWhitePlayer = playerColor === 'white'
  const moveEvals: Array<{ fen: string; cp: number; isPlayerMove: boolean }> = []

  for (let i = 0; i < history.length; i++) {
    const isWhiteMove  = i % 2 === 0
    const cpBefore     = whiteCps[i]
    const cpAfter      = whiteCps[i + 1]
    const cpLoss       = isWhiteMove
      ? Math.max(0, cpBefore - cpAfter)
      : Math.max(0, cpAfter  - cpBefore)
    const isPlayerMove = isWhitePlayer ? isWhiteMove : !isWhiteMove

    moveEvals.push({ fen: fens[i + 1], cp: cpLoss, isPlayerMove })
  }

  return moveEvals
}

//----------------------------------------------------------------------------------
//  enrichGamesStockfish — server-side batch enrichment using native binary
//----------------------------------------------------------------------------------
export async function enrichGamesStockfish(opts: {
  dateFrom?: string
  dateTo?: string
  depth?: number
  limit?: number
}): Promise<{ processed: number; errors: number; skipped: number }> {
  const binPath = process.env.STOCKFISH_PATH ?? ''
  if (!binPath) throw new Error('STOCKFISH_PATH env var not set — restart the dev server after adding it to .env.locallocal')

  const depth    = opts.depth ?? 16
  const limit    = opts.limit ?? 10
  const allGames = await getUnenrichedGames(limit, { dateFrom: opts.dateFrom, dateTo: opts.dateTo })

  if (allGames.length === 0) return { processed: 0, errors: 0, skipped: 0 }

  const { sql } = await import('nextjs-shared/db')
  const db      = await sql()
  const fromTs  = opts.dateFrom ? Math.floor(new Date(opts.dateFrom).getTime() / 1000) : 0
  const toTs    = opts.dateTo   ? Math.floor(new Date(opts.dateTo + 'T23:59:59').getTime() / 1000) : Math.floor(Date.now() / 1000)
  const snapRes = await db.query({
    caller: 'enrichGamesStockfish',
    query: `
      SELECT
        (SELECT COUNT(*) FROM ten_enrichment e
         JOIN tgr_gamesraw r ON r.gr_grid = e.en_grid
         WHERE e.en_enriched = TRUE
           AND r.gr_end_time >= $1 AND r.gr_end_time <= $2) AS enriched,
        (SELECT COUNT(*) FROM tgr_gamesraw r
         LEFT JOIN ten_enrichment e ON e.en_grid = r.gr_grid AND e.en_player = r.gr_player_username
         WHERE (e.en_enid IS NULL OR e.en_enriched = FALSE)
           AND r.gr_end_time >= $1 AND r.gr_end_time <= $2) AS remaining
    `,
    params: [fromTs, toTs],
    functionName: 'enrichGamesStockfish'
  })
  const snapStart     = parseInt(snapRes.rows[0].enriched  ?? '0')
  const snapRemaining = parseInt(snapRes.rows[0].remaining ?? '0')

  const sf = new StockfishProcess(binPath)
  await sf.init()

  let processed = 0
  let errors    = 0
  let skipped   = 0
  const t0      = Date.now()
  const logId   = await startPipelineLog(2, 'Stockfish Game Enrichment', allGames.length, snapStart, snapRemaining, opts.dateFrom, opts.dateTo)

  for (const game of allGames) {
    if (!game.pgn) { skipped++; continue }
    try {
      const moveEvals = await analyzeGame(sf, game.pgn, game.color, depth)
      if (moveEvals.length === 0) { skipped++; continue }

      await saveStockfishResults({
        grid:        game.grid,
        player:      game.player,
        termination: game.termination,
        moveEvals
      })
      processed++
    } catch (err) {
      console.error(`enrichGamesStockfish: error on game ${game.grid}`, err)
      errors++
    }
  }

  sf.quit()
  await completePipelineLog(logId, processed, errors, skipped, Date.now() - t0, snapStart + processed)
  return { processed, errors, skipped }
}
