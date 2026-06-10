import { Chess } from 'chess.js'
import { MultiPvResult } from './analysisTree'

export interface MoveEvaluation {
  san: string
  fen: string
  fenBefore: string
  cp: number
  cpBefore: number
  bestMove: string
  bestMoveSan: string
  bestLineSans: string[]
  cpLoss: number
  classification: 'blunder' | 'mistake' | 'inaccuracy' | 'good'
  depth: number
}

export interface AnalysisProgress {
  current: number
  total: number
  move?: string
}

type ProgressCallback = (progress: AnalysisProgress) => void

export interface InfiniteAnalysisUpdate {
  depth: number
  lines: MultiPvResult[]
  nodes: number
  nps: number
  timeMs: number
}

// Read defaults from env, fallback to hardcoded values
export const STOCKFISH_DEFAULTS = {
  depth: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_DEPTH ?? '16', 10),
  multiPv: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_MULTIPV ?? '3', 10),
  blunderCp: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_BLUNDER_CP ?? '200', 10),
  mistakeCp: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_MISTAKE_CP ?? '100', 10),
  inaccuracyCp: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_INACCURACY_CP ?? '50', 10),
  hash: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_HASH ?? '128', 10),
  bestLineLength: parseInt(process.env.NEXT_PUBLIC_STOCKFISH_BESTLINE_LENGTH ?? '5', 10)
}

function classifyMove(cpLoss: number): MoveEvaluation['classification'] {
  if (cpLoss > STOCKFISH_DEFAULTS.blunderCp) return 'blunder'
  if (cpLoss > STOCKFISH_DEFAULTS.mistakeCp) return 'mistake'
  if (cpLoss > STOCKFISH_DEFAULTS.inaccuracyCp) return 'inaccuracy'
  return 'good'
}

function uciToSan(fen: string, uciMove: string): string {
  try {
    const g = new Chess(fen)
    const from = uciMove.slice(0, 2)
    const to = uciMove.slice(2, 4)
    const promotion = uciMove.length > 4 ? uciMove[4] : undefined
    const result = g.move({ from, to, promotion })
    return result ? result.san : uciMove
  } catch {
    return uciMove
  }
}

function uciLineToSans(fen: string, uciMoves: string[]): string[] {
  const sans: string[] = []
  try {
    const g = new Chess(fen)
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promotion = uci.length > 4 ? uci[4] : undefined
      const result = g.move({ from, to, promotion })
      if (!result) break
      sans.push(result.san)
    }
  } catch {
    // partial conversion is fine
  }
  return sans
}

export class StockfishEngine {
  private worker: Worker | null = null
  private ready = false
  private resolveReady: (() => void) | null = null

  async init(): Promise<void> {
    if (this.ready) return

    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker('/stockfish/stockfish-18-lite-single.js')

        this.resolveReady = resolve

        this.worker.onmessage = (e: MessageEvent) => {
          const line = typeof e.data === 'string' ? e.data : e.data?.toString?.() ?? ''
          if (line === 'uciok') {
            this.send(`setoption name Hash value ${STOCKFISH_DEFAULTS.hash}`)
            this.send('isready')
          } else if (line === 'readyok') {
            this.ready = true
            if (this.resolveReady) {
              this.resolveReady()
              this.resolveReady = null
            }
          }
        }

        this.worker.onerror = (err) => {
          reject(new Error(`Stockfish worker failed to load: ${err.message}`))
        }

        this.send('uci')
      } catch (err) {
        reject(err)
      }
    })
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd)
  }

  private infiniteHandler: ((e: MessageEvent) => void) | null = null

  /**
   * Start infinite analysis on a position. Calls onUpdate with live results
   * as the engine searches deeper. Call stop() to end.
   */
  startInfiniteAnalysis(
    fen: string,
    numLines: number,
    onUpdate: (result: InfiniteAnalysisUpdate) => void
  ): void {
    if (!this.worker || !this.ready) return

    // Remove any previous handler
    if (this.infiniteHandler) {
      this.worker.removeEventListener('message', this.infiniteHandler)
      this.infiniteHandler = null
    }

    const isBlackToMove = fen.split(' ')[1] === 'b'
    const results = new Map<number, { cp: number; pv: string; depth: number }>()
    let currentMaxDepth = 0

    this.infiniteHandler = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : ''

      if (line.startsWith('info') && line.includes('score')) {
        const depthMatch = line.match(/depth (\d+)/)
        const multipvMatch = line.match(/multipv (\d+)/)
        const cpMatch = line.match(/score cp (-?\d+)/)
        const mateMatch = line.match(/score mate (-?\d+)/)
        const pvMatch = line.match(/ pv (.+)/)
        const nodesMatch = line.match(/nodes (\d+)/)
        const npsMatch = line.match(/nps (\d+)/)
        const timeMatch = line.match(/ time (\d+)/)

        const depth = depthMatch ? parseInt(depthMatch[1]) : 0
        const rank = multipvMatch ? parseInt(multipvMatch[1]) : 1

        if (depth >= 4) {
          let cp = 0
          if (cpMatch) cp = parseInt(cpMatch[1])
          else if (mateMatch) {
            const mateIn = parseInt(mateMatch[1])
            cp = mateIn > 0 ? 10000 - mateIn : -10000 + Math.abs(mateIn)
          }
          const pv = pvMatch ? pvMatch[1] : ''

          const existing = results.get(rank)
          if (!existing || depth > existing.depth) {
            results.set(rank, { cp, pv, depth })
          }

          if (depth > currentMaxDepth) {
            currentMaxDepth = depth
          }

          // Build update with all current best lines
          const lines: MultiPvResult[] = []
          for (const [r, data] of results.entries()) {
            const uciMoves = data.pv ? data.pv.split(' ') : []
            const sans = uciLineToSans(fen, uciMoves)
            lines.push({
              rank: r,
              cp: isBlackToMove ? -data.cp : data.cp,
              bestMoveUci: uciMoves[0] || '',
              bestMoveSan: sans[0] || '',
              lineSans: sans,
              lineUci: uciMoves
            })
          }
          lines.sort((a, b) => a.rank - b.rank)

          onUpdate({
            depth: currentMaxDepth,
            lines,
            nodes: nodesMatch ? parseInt(nodesMatch[1]) : 0,
            nps: npsMatch ? parseInt(npsMatch[1]) : 0,
            timeMs: timeMatch ? parseInt(timeMatch[1]) : 0
          })
        }
      }

      if (line.startsWith('bestmove')) {
        // Engine was stopped
        if (this.infiniteHandler) {
          this.worker!.removeEventListener('message', this.infiniteHandler)
          this.infiniteHandler = null
        }
      }
    }

    this.worker.addEventListener('message', this.infiniteHandler)
    this.send(`setoption name MultiPV value ${numLines}`)
    this.send('ucinewgame')
    this.send(`position fen ${fen}`)
    this.send('go infinite')
  }

  /**
   * Stop infinite analysis
   */
  stopAnalysis(): void {
    if (this.infiniteHandler) {
      this.send('stop')
    }
  }

  async evaluate(fen: string, depth: number = STOCKFISH_DEFAULTS.depth): Promise<{ cp: number; bestMove: string; pv: string }> {
    if (!this.worker || !this.ready) throw new Error('Stockfish not initialized')

    return new Promise((resolve) => {
      let bestCp = 0
      let bestMove = ''
      let bestPv = ''

      const handler = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : ''

        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/depth (\d+)/)
          const cpMatch = line.match(/score cp (-?\d+)/)
          const mateMatch = line.match(/score mate (-?\d+)/)
          const pvMatch = line.match(/ pv (.+)/)
          const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0

          if (currentDepth >= depth - 2) {
            if (cpMatch) {
              bestCp = parseInt(cpMatch[1])
            } else if (mateMatch) {
              const mateIn = parseInt(mateMatch[1])
              bestCp = mateIn > 0 ? 10000 - mateIn : -10000 + Math.abs(mateIn)
            }
            if (pvMatch) {
              bestPv = pvMatch[1]
              bestMove = bestPv.split(' ')[0]
            }
          }
        }

        if (line.startsWith('bestmove')) {
          this.worker!.removeEventListener('message', handler)
          const bm = line.split(' ')[1]
          if (bm && bm !== '(none)') bestMove = bm
          resolve({ cp: bestCp, bestMove, pv: bestPv })
        }
      }

      this.worker!.addEventListener('message', handler)
      this.send('ucinewgame')
      this.send(`position fen ${fen}`)
      this.send(`go depth ${depth}`)
    })
  }

  async analyzeGame(
    fens: string[],
    sans: string[],
    onProgress?: ProgressCallback,
    depth?: number
  ): Promise<MoveEvaluation[]> {
    if (!this.worker || !this.ready) throw new Error('Stockfish not initialized')

    const evaluations: MoveEvaluation[] = []

    // Step 1: Evaluate every position ONCE (N+1 positions for N moves)
    // This eliminates oscillation from evaluating the same position twice
    const positionEvals: { cp: number; bestMove: string; pv: string }[] = []

    for (let i = 0; i <= sans.length; i++) {
      onProgress?.({ current: i, total: sans.length, move: i > 0 ? sans[i - 1] : 'starting position' })
      const analysisDepth = depth ?? STOCKFISH_DEFAULTS.depth
      const result = await this.evaluate(fens[i], analysisDepth)

      // Normalize to white's perspective
      // Even positions (0, 2, 4...) = white to move → engine cp is from white's view
      // Odd positions (1, 3, 5...) = black to move → negate to get white's view
      const isWhiteToMove = i % 2 === 0
      const cpWhitePerspective = isWhiteToMove ? result.cp : -result.cp

      positionEvals.push({
        cp: cpWhitePerspective,
        bestMove: result.bestMove,
        pv: result.pv
      })
    }

    // Step 2: Build move evaluations from consecutive position evals
    for (let i = 0; i < sans.length; i++) {
      const fenBefore = fens[i]
      const fenAfter = fens[i + 1]
      const isWhiteMove = i % 2 === 0

      const cpBefore = positionEvals[i].cp     // eval before this move (white's perspective)
      const cpAfter = positionEvals[i + 1].cp  // eval after this move (white's perspective)

      // cpLoss from the moving side's perspective
      // White wants cpAfter >= cpBefore (maintain or increase advantage)
      // Black wants cpAfter <= cpBefore (decrease white's advantage)
      const cpLoss = isWhiteMove
        ? Math.max(0, cpBefore - cpAfter)
        : Math.max(0, cpAfter - cpBefore)

      // Best move from the position before (engine's recommendation)
      const beforeEval = positionEvals[i]
      const bestMoveSan = beforeEval.bestMove
        ? uciToSan(fenBefore, beforeEval.bestMove)
        : ''

      const pvMoves = beforeEval.pv ? beforeEval.pv.split(' ').slice(0, STOCKFISH_DEFAULTS.bestLineLength) : []
      const bestLineSans = pvMoves.length > 0
        ? uciLineToSans(fenBefore, pvMoves)
        : []

      evaluations.push({
        san: sans[i],
        fen: fenAfter,
        fenBefore,
        cp: cpAfter,
        cpBefore,
        bestMove: beforeEval.bestMove,
        bestMoveSan,
        bestLineSans,
        cpLoss,
        classification: classifyMove(cpLoss),
        depth: depth ?? STOCKFISH_DEFAULTS.depth
      })
    }

    return evaluations
  }

  async evaluateMultiPV(
    fen: string,
    numLines: number = 3,
    depth: number = STOCKFISH_DEFAULTS.depth
  ): Promise<MultiPvResult[]> {
    if (!this.worker || !this.ready) throw new Error('Stockfish not initialized')

    return new Promise((resolve) => {
      const results = new Map<number, { cp: number; pv: string; depth: number }>()

      const handler = (e: MessageEvent) => {
        const line = typeof e.data === 'string' ? e.data : ''

        if (line.startsWith('info') && line.includes('score')) {
          const depthMatch = line.match(/depth (\d+)/)
          const multipvMatch = line.match(/multipv (\d+)/)
          const cpMatch = line.match(/score cp (-?\d+)/)
          const mateMatch = line.match(/score mate (-?\d+)/)
          const pvMatch = line.match(/ pv (.+)/)

          const currentDepth = depthMatch ? parseInt(depthMatch[1]) : 0
          const rank = multipvMatch ? parseInt(multipvMatch[1]) : 1

          // Accept any depth, keep the highest per rank
          if (currentDepth >= 4) {
            let cp = 0
            if (cpMatch) {
              cp = parseInt(cpMatch[1])
            } else if (mateMatch) {
              const mateIn = parseInt(mateMatch[1])
              cp = mateIn > 0 ? 10000 - mateIn : -10000 + Math.abs(mateIn)
            }
            const pv = pvMatch ? pvMatch[1] : ''

            const existing = results.get(rank)
            if (!existing || currentDepth > existing.depth) {
              results.set(rank, { cp, pv, depth: currentDepth })
            }
          }
        }

        if (line.startsWith('bestmove')) {
          this.worker!.removeEventListener('message', handler)

          // Reset MultiPV to 1
          this.send('setoption name MultiPV value 1')

          // Determine side to move from FEN to normalize cp to white's perspective
          // Stockfish reports cp from the side to move's perspective
          const isBlackToMove = fen.split(' ')[1] === 'b'

          // Build results array
          const pvResults: MultiPvResult[] = []
          for (const [rank, data] of results.entries()) {
            const uciMoves = data.pv ? data.pv.split(' ') : []
            const sans = uciLineToSans(fen, uciMoves)
            pvResults.push({
              rank,
              cp: isBlackToMove ? -data.cp : data.cp,
              bestMoveUci: uciMoves[0] || '',
              bestMoveSan: sans[0] || '',
              lineSans: sans,
              lineUci: uciMoves
            })
          }

          pvResults.sort((a, b) => a.rank - b.rank)
          resolve(pvResults)
        }
      }

      this.worker!.addEventListener('message', handler)
      this.send(`setoption name MultiPV value ${numLines}`)
      this.send('ucinewgame')
      this.send(`position fen ${fen}`)
      this.send(`go depth ${depth}`)
    })
  }

  destroy(): void {
    this.worker?.terminate()
    this.worker = null
    this.ready = false
  }
}
