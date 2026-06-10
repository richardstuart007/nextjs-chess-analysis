'use client'

import { useState, useRef, useCallback } from 'react'
import { Chess } from 'chess.js'
import { StockfishEngine, type MoveEvaluation } from '@/src/lib/stockfish'
import { saveStockfishResults } from '@/src/lib/analysis/enrichGames'
import { saveEvaluation, getPositionsToEvaluate } from '@/src/lib/analysis/chessdb'
import { MyButton } from 'nextjs-shared/MyButton'

// ============================================================================
// EvalProgress — runs Stockfish in browser for batch enrichment / position eval
// ============================================================================

export type EvalMode = 'enrich' | 'positions'

interface EnrichGame {
  grid: number
  player: string
  pgn: string
  result: string
  termination: string | null
  chesscom_uuid: string
  color?: string   // 'white' | 'black' — derived from game data
}

interface EvalProgressProps {
  mode: EvalMode
  games?: EnrichGame[]    // for mode='enrich'
  positionLimit?: number  // for mode='positions'
  depth?: number
  onComplete?: (processed: number) => void
}

interface ProgressState {
  running: boolean
  current: number
  total: number
  label: string
  errors: number
}

export default function EvalProgress({
  mode,
  games = [],
  positionLimit = 100,
  depth = 16,
  onComplete
}: EvalProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({
    running: false, current: 0, total: 0, label: '', errors: 0
  })
  const engineRef = useRef<StockfishEngine | null>(null)
  const cancelRef  = useRef(false)

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  const runEnrich = useCallback(async () => {
    if (!games.length) return
    cancelRef.current = false

    const engine = new StockfishEngine()
    engineRef.current = engine
    await engine.init()

    setProgress({ running: true, current: 0, total: games.length, label: 'Starting…', errors: 0 })
    let errors = 0

    for (let i = 0; i < games.length; i++) {
      if (cancelRef.current) break
      const game = games[i]
      setProgress(p => ({ ...p, current: i, label: `${game.player} game ${i + 1}/${games.length}` }))

      try {
        const chess = new Chess()
        chess.loadPgn(game.pgn)
        const history = chess.history({ verbose: true })

        const fens: string[] = []
        const sans: string[] = []
        const replay = new Chess()
        fens.push(replay.fen())
        for (const mv of history) {
          replay.move(mv.san)
          fens.push(replay.fen())
          sans.push(mv.san)
        }

        const evals = await engine.analyzeGame(fens, sans, undefined, depth)

        // Determine which half-moves belong to the player (from per-game color field)
        const isWhitePlayer = (game.color ?? 'white') === 'white'
        const moveEvals = evals.map((ev: MoveEvaluation, idx: number) => ({
          fen:          ev.fen,
          cp:           ev.cpLoss,
          isPlayerMove: isWhitePlayer ? idx % 2 === 0 : idx % 2 === 1
        }))

        await saveStockfishResults({
          grid:        game.grid,
          player:      game.player,
          termination: game.termination,
          moveEvals
        })
      } catch (err) {
        console.error(`EvalProgress enrich error game ${game.grid}`, err)
        errors++
      }
    }

    engine.destroy()
    engineRef.current = null
    setProgress(p => ({ ...p, running: false, current: games.length, label: 'Done', errors }))
    onComplete?.(games.length - errors)
  }, [games, depth, onComplete])

  const runPositions = useCallback(async () => {
    cancelRef.current = false

    const positions = await getPositionsToEvaluate(positionLimit)
    if (!positions.length) {
      setProgress({ running: false, current: 0, total: 0, label: 'No positions to evaluate', errors: 0 })
      return
    }

    const engine = new StockfishEngine()
    engineRef.current = engine
    await engine.init()

    setProgress({ running: true, current: 0, total: positions.length, label: 'Starting…', errors: 0 })
    let errors = 0

    for (let i = 0; i < positions.length; i++) {
      if (cancelRef.current) break
      const pos = positions[i]
      setProgress(p => ({ ...p, current: i, label: `Evaluating position ${i + 1}/${positions.length}` }))

      try {
        const result = await engine.evaluate(pos.pos_fen, depth)
        await saveEvaluation({
          posFen:   pos.pos_fen,
          moveSan:  null,
          cp:       pos.pos_color === 'b' ? -result.cp : result.cp,
          mate:     null,
          bestMove: result.bestMove || null,
          depth
        })
      } catch (err) {
        console.error(`EvalProgress position error ${pos.pos_fen}`, err)
        errors++
      }
    }

    engine.destroy()
    engineRef.current = null
    setProgress(p => ({ ...p, running: false, current: positions.length, label: 'Done', errors }))
    onComplete?.(positions.length - errors)
  }, [positionLimit, depth, onComplete])

  const handleStart = () => {
    if (mode === 'enrich')    runEnrich()
    else                       runPositions()
  }

  const handleStop = () => {
    cancelRef.current = true
    engineRef.current?.stopAnalysis()
    setProgress(p => ({ ...p, running: false, label: 'Stopped' }))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {!progress.running ? (
          <MyButton onClick={handleStart}>
            {mode === 'enrich' ? 'Start Stockfish Analysis' : 'Evaluate Positions'}
          </MyButton>
        ) : (
          <MyButton onClick={handleStop} overrideClass='bg-red-500 hover:bg-red-600'>
            Stop
          </MyButton>
        )}
        <span className="text-sm text-gray-600">{progress.label}</span>
      </div>

      {(progress.running || progress.current > 0) && (
        <div className="space-y-1">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-blue-600 h-3 rounded-full transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{progress.current} / {progress.total}</span>
            <span>{pct}%{progress.errors > 0 ? ` · ${progress.errors} errors` : ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}
