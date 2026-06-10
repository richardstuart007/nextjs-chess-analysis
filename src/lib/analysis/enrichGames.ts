'use server'

import { Chess } from 'chess.js'
import { saveEnrichmentPartial, saveStockfishEnrichment, getUnenrichedGamesForPlayer } from './chessdb'

// ============================================================================
// Server-side enrichment: PGN-only fields (no Stockfish required)
// Called from the API route; Stockfish fields filled in by client
// ============================================================================

function detectPhase(chess: Chess, moveIndex: number): 'OPENING' | 'MIDDLEGAME' | 'ENDGAME' {
  const board = chess.board()
  let material = 0
  let hasWhiteQueen = false
  let hasBlackQueen = false

  for (const rank of board) {
    for (const sq of rank) {
      if (!sq) continue
      if (sq.type === 'q') {
        if (sq.color === 'w') hasWhiteQueen = true
        else hasBlackQueen = true
      }
      const pts: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 }
      material += pts[sq.type] ?? 0
    }
  }

  const queensGone = !hasWhiteQueen && !hasBlackQueen
  if (queensGone || material < 26) return 'ENDGAME'
  if (moveIndex >= 15) return 'MIDDLEGAME'
  return 'OPENING'
}

export async function enrichGamesPartial(opts: {
  player: string
  limit?: number
}): Promise<{ processed: number; errors: number }> {
  const games = await getUnenrichedGamesForPlayer(opts.player, opts.limit ?? 100)
  let errors = 0

  for (const game of games) {
    try {
      const chess = new Chess()
      let phaseLost: string | null = null
      let termination: string | null = game.termination

      try {
        chess.loadPgn(game.pgn)
        const headers = chess.header()
        termination = termination ?? headers['Termination'] ?? null

        // Detect phase at game end
        const history = chess.history()
        const replay  = new Chess()
        for (let i = 0; i < history.length; i++) {
          replay.move(history[i])
          phaseLost = detectPhase(replay, i)
        }
      } catch {
        // PGN parse failure — store what we have
      }

      await saveEnrichmentPartial({
        grid:        game.grid,
        player:      game.player,
        termination: termination ?? null,
        phaseLost:   phaseLost
      })
    } catch (err) {
      console.error(`enrichGamesPartial: error on grid ${game.grid}`, err)
      errors++
    }
  }

  return { processed: games.length - errors, errors }
}

// Called from the client (via server action) after Stockfish analysis completes
export async function saveStockfishResults(data: {
  grid: number
  player: string
  termination: string | null
  moveEvals: Array<{ fen: string; cp: number; isPlayerMove: boolean }>
}): Promise<void> {
  const { moveEvals, termination } = data

  // Separate player moves only
  const playerEvals = moveEvals.filter(e => e.isPlayerMove)
  if (playerEvals.length === 0) return

  const cpValues  = playerEvals.map(e => e.cp)
  const losses    = cpValues.filter(c => c > 0)
  const avgCpLoss = losses.length > 0
    ? losses.reduce((a, b) => a + b, 0) / losses.length
    : 0
  const blunders  = losses.filter(c => c > 200).length
  const mistakes  = losses.filter(c => c > 100).length
  const accuracy  = losses.length === 0
    ? 100
    : Math.max(0, 100 - avgCpLoss / 5)

  // Volatility: sign changes in raw cp
  let volatility  = 0
  let leadChanges = 0
  let maxAdv      = 0
  let maxDisadv   = 0
  let critMove: number | null = null
  let critDrop: number | null = null
  let critFen:  string | null = null
  let phaseLost: string | null = null

  const allEvals = moveEvals
  let prevSign = 0
  for (let i = 0; i < allEvals.length; i++) {
    const cp   = allEvals[i].cp  // positive = good for player
    const sign = cp > 0 ? 1 : cp < 0 ? -1 : 0
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) volatility++
    if (i > 0) {
      const prev = allEvals[i - 1].cp
      if ((prev > 100 && cp < -100) || (prev < -100 && cp > 100)) leadChanges++
    }
    if (cp > maxAdv)    maxAdv    = cp
    if (cp < maxDisadv) maxDisadv = cp
    prevSign = sign !== 0 ? sign : prevSign

    if (allEvals[i].isPlayerMove && i > 0) {
      const drop = allEvals[i - 1].cp - cp
      if (critDrop === null || drop > critDrop) {
        critDrop = drop
        critMove = Math.ceil((i + 1) / 2)
        critFen  = allEvals[i].fen
      }
    }
  }

  // Phase at critical moment
  if (critFen) {
    try {
      const cChess = new Chess(critFen)
      const board  = cChess.board()
      let mat = 0
      let wQ = false; let bQ = false
      for (const rank of board) {
        for (const sq of rank) {
          if (!sq) continue
          if (sq.type === 'q') { if (sq.color === 'w') wQ = true; else bQ = true }
          const pts: Record<string, number> = { p:1, n:3, b:3, r:5, q:9 }
          mat += pts[sq.type] ?? 0
        }
      }
      const queensGone = !wQ && !bQ
      if (queensGone || mat < 26) phaseLost = 'ENDGAME'
      else if (critMove && critMove >= 15) phaseLost = 'MIDDLEGAME'
      else phaseLost = 'OPENING'
    } catch { /* ignore */ }
  }

  let timeLossFlag: string | null = null
  if (termination?.toLowerCase().includes('on time') || termination?.toLowerCase().includes('timeout')) {
    const finalCp = allEvals[allEvals.length - 1]?.cp ?? 0
    if (finalCp > 100)       timeLossFlag = 'TIME_WIN'
    else if (finalCp < -100) timeLossFlag = 'TIME_LOSS'
    else                     timeLossFlag = 'TIME_EQL'
  }

  await saveStockfishEnrichment({
    grid:           data.grid,
    player:         data.player,
    timeLossFlag,
    finalCp:        allEvals[allEvals.length - 1]?.cp ?? null,
    volatility,
    leadChanges,
    maxAdvantage:    maxAdv,
    maxDisadvantage: maxDisadv,
    phaseLost,
    criticalMove:    critMove,
    criticalCpDrop:  critDrop,
    criticalFen:     critFen,
    avgCpLoss:       Math.round(avgCpLoss * 10) / 10,
    blunders,
    mistakes,
    accuracy:        Math.round(accuracy * 10) / 10
  })
}
