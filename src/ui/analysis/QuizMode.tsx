'use client'

import { useState, useCallback } from 'react'
import { Chess, type Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { saveQuizResult } from '@/src/lib/analysis/chessdb'

interface QuizPosition {
  pos_fen: string
  pos_reached: number
  pos_color: string | null
  ins_theme: string | null
  ins_advice: string | null
  ins_priority: number | null
  best_move: string | null
  habit_move: string | null
  habit_times: number | null
}

interface SessionScore {
  total: number
  good: number
  totalCpLoss: number
}

type Phase = 'question' | 'reveal'

interface QuizModeProps {
  queue: QuizPosition[]
  sessionId: string
}

function cpLossLabel(cp: number | null): string {
  if (cp === null) return '—'
  if (cp > 150) return 'BAD'
  if (cp > 75)  return 'POOR'
  if (cp > 25)  return 'OK'
  return 'GOOD'
}

function cpLossCls(cp: number | null): string {
  if (cp === null) return 'text-gray-400'
  if (cp > 150) return 'text-red-600 font-semibold'
  if (cp > 75)  return 'text-amber-600 font-semibold'
  if (cp > 25)  return 'text-yellow-700 font-semibold'
  return 'text-green-700 font-semibold'
}

export default function QuizMode({ queue, sessionId }: QuizModeProps) {
  const [idx,       setIdx]       = useState(0)
  const [phase,     setPhase]     = useState<Phase>('question')
  const [chosen,    setChosen]    = useState<string | null>(null)
  const [score,     setScore]     = useState<SessionScore>({ total: 0, good: 0, totalCpLoss: 0 })
  const [fromSq,    setFromSq]    = useState<Square | null>(null)

  const current = queue[idx] ?? null

  const handleMove = useCallback((from: string, to: string) => {
    if (phase !== 'question' || !current) return false
    const chess = new Chess(current.pos_fen)
    let result
    try {
      result = chess.move({ from, to })
    } catch {
      return false
    }
    if (!result) return false

    const san       = result.san
    const bestUci   = current.best_move ?? ''
    const bestSan   = (() => {
      if (!bestUci || bestUci.length < 4) return null
      try {
        const g = new Chess(current.pos_fen)
        const r = g.move({ from: bestUci.slice(0,2), to: bestUci.slice(2,4), promotion: bestUci[4] })
        return r?.san ?? null
      } catch { return null }
    })()

    const isGood    = san === bestSan
    const cpLoss    = isGood ? 0 : 75  // rough estimate without full eval

    setChosen(san)
    setPhase('reveal')
    setScore(s => ({
      total:      s.total + 1,
      good:       s.good + (isGood ? 1 : 0),
      totalCpLoss: s.totalCpLoss + cpLoss
    }))

    saveQuizResult({
      session:     sessionId,
      posFen:      current.pos_fen,
      movePlayed:  san,
      correct:     isGood,
      cpLoss:      cpLoss > 0 ? cpLoss : null
    }).catch(() => {})

    return true
  }, [phase, current, sessionId])

  const handleSquareClick = useCallback((sq: Square) => {
    if (phase !== 'question' || !current) return
    const chess = new Chess(current.pos_fen)
    if (fromSq) {
      const moved = handleMove(fromSq, sq)
      if (moved) { setFromSq(null); return }
      const piece = chess.get(fromSq)
      const target = chess.get(sq)
      if (target && piece && target.color === piece.color) {
        setFromSq(sq)
      } else {
        setFromSq(null)
      }
    } else {
      const piece = chess.get(sq)
      const turn  = chess.turn()
      if (piece && piece.color === turn) setFromSq(sq)
    }
  }, [phase, current, fromSq, handleMove])

  const handleNext = () => {
    if (idx + 1 >= queue.length) {
      setIdx(0)
    } else {
      setIdx(i => i + 1)
    }
    setPhase('question')
    setChosen(null)
    setFromSq(null)
  }

  const handleRetry = () => {
    setPhase('question')
    setChosen(null)
    setFromSq(null)
  }

  if (!current) {
    return (
      <div className="text-center py-12 text-gray-500">
        No quiz positions available. Run insights generation first.
      </div>
    )
  }

  const orientation = current.pos_color === 'b' ? 'black' : 'white'
  const bestUci     = current.best_move ?? ''
  const habitUci    = (() => {
    // We don't store UCI for habit move directly; we use best_move as proxy
    return ''
  })()

  // Arrows for reveal state
  const customArrows: [Square, Square, string][] = []
  if (phase === 'reveal') {
    if (bestUci.length >= 4) {
      customArrows.push([bestUci.slice(0,2) as Square, bestUci.slice(2,4) as Square, 'green'])
    }
  }

  const avgCpLoss = score.total > 0
    ? Math.round(score.totalCpLoss / score.total)
    : 0

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Session score bar */}
      <div className="flex items-center gap-4 bg-gray-800 text-white rounded-lg px-4 py-2 text-sm flex-wrap">
        <span>Positions: <strong>{score.total}</strong></span>
        <span>Good moves: <strong>{score.good}</strong></span>
        <span>Avg CP loss: <strong>{avgCpLoss}</strong></span>
        <span className="ml-auto text-gray-400 text-xs">
          {idx + 1} / {queue.length}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Board */}
        <div className="space-y-2">
          <Chessboard
            id="quiz-board"
            position={current.pos_fen}
            boardWidth={400}
            boardOrientation={orientation}
            arePiecesDraggable={phase === 'question'}
            onPieceDrop={(from, to) => handleMove(from, to)}
            onSquareClick={handleSquareClick}
            customArrows={customArrows}
            customSquareStyles={
              fromSq
                ? { [fromSq]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' } }
                : {}
            }
          />
          {phase === 'question' && (
            <p className="text-sm text-gray-600 text-center">
              Click or drag a piece to play your move.
            </p>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {phase === 'question' && (
            <div className="bg-white border rounded-lg p-4 space-y-2">
              <h2 className="font-semibold text-gray-800">
                You have reached this position{' '}
                <strong>{current.pos_reached}</strong> times.
              </h2>
              <p className="text-sm text-gray-600">Find the best move.</p>
              {current.ins_theme && (
                <p className="text-xs text-gray-400 italic">
                  Theme: {current.ins_theme}
                </p>
              )}
            </div>
          )}

          {phase === 'reveal' && (
            <div className="bg-white border rounded-lg p-4 space-y-3 text-sm">
              <h2 className="font-semibold">Result</h2>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Your choice:</span>
                  <span className="font-mono font-medium">{chosen ?? '—'}</span>
                </div>
                {current.habit_move && current.habit_move !== chosen && (
                  <div className="flex justify-between text-red-600">
                    <span>Your usual habit:</span>
                    <span className="font-mono">{current.habit_move}
                      {current.habit_times != null && (
                        <span className="text-red-400 text-xs ml-1">
                          ({current.habit_times}× played)
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-green-700">
                  <span>Stockfish best:</span>
                  <span className="font-mono font-medium">{current.best_move ?? '—'}</span>
                </div>
              </div>

              {current.ins_advice && (
                <div className="border-t pt-3 text-gray-600 italic text-xs">
                  {current.ins_advice}
                </div>
              )}

              <div className="flex gap-2 flex-wrap pt-2">
                <button
                  onClick={handleNext}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Next Position
                </button>
                <button
                  onClick={handleRetry}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                >
                  Retry
                </button>
                <a
                  href="/analysis/habits"
                  className="px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50"
                >
                  Back to Habits
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
