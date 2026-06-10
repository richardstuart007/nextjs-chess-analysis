'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Chess } from 'chess.js'
import { MyButton } from 'nextjs-shared/MyButton'
import { Chessboard } from 'react-chessboard'
import type { Square } from 'chess.js'
import type { PositionRow, MoveRow, EvaluationRow, InsightRow } from '@/src/lib/analysis/chessdb'

interface GameHit {
  game_ref:    string
  player:      string
  move_played: string
  move_num:    number | null
  cp_loss:     number | null
  result:      string | null
  grid:        number | null
}

interface PositionDetailProps {
  position:  PositionRow | null
  moves:     MoveRow[]
  posEval:   EvaluationRow | null
  insight:   InsightRow | null
  gameCount: number
  games:     GameHit[]
}

type Tab = 'moves' | 'advice' | 'history'

function cpBadge(cpDelta: number | null): { label: string; cls: string } {
  if (cpDelta === null) return { label: '—',   cls: 'text-gray-400' }
  if (cpDelta < -150)  return { label: 'BAD',  cls: 'bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (cpDelta < -75)   return { label: 'POOR', cls: 'bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (cpDelta < -25)   return { label: 'OK',   cls: 'bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  return { label: 'GOOD', cls: 'bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
}

function resultBadge(result: string | null): { label: string; cls: string } {
  if (result === 'win')  return { label: 'W', cls: 'bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (result === 'loss') return { label: 'L', cls: 'bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-xs font-semibold' }
  if (result === 'draw') return { label: 'D', cls: 'bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs font-semibold' }
  return { label: '—', cls: 'text-gray-400 text-xs' }
}

export default function PositionDetail({
  position,
  moves,
  posEval,
  insight,
  gameCount,
  games
}: PositionDetailProps) {
  const router = useRouter()
  const [tab,          setTab]          = useState<Tab>('moves')
  const [selectedMove, setSelectedMove] = useState<string | null>(null)

  if (!position) {
    return <div className="text-center py-12 text-gray-500">Position not found.</div>
  }

  const orientation  = position.pos_color === 'b' ? 'black' : 'white'
  const playerName   = games[0]?.player ?? null
  const playerColor  = position.pos_color === 'b' ? 'Black' : 'White'
  const positionCp   = posEval?.eva_cp ?? null

  // Convert best move UCI → SAN
  const chess = new Chess(position.pos_fen)
  const bm = posEval?.eva_best_move ?? null
  const tryMove = bm
    ? chess.move({ from: bm.slice(0, 2), to: bm.slice(2, 4), promotion: bm[4] ?? undefined })
    : null
  const bestMoveSan = tryMove?.san ?? bm ?? null

  // Build arrow overlays: green=best, red=habit (skip red if same squares as best)
  const customArrows: [Square, Square, string][] = []
  const bestFrom = bm?.slice(0, 2) ?? ''
  const bestTo   = bm?.slice(2, 4) ?? ''
  if (bm && bm.length >= 4) {
    customArrows.push([bestFrom as Square, bestTo as Square, 'green'])
  }
  const habitMov = moves[0]
  if (habitMov?.mov_uci && habitMov.mov_uci.length >= 4) {
    const hFrom = habitMov.mov_uci.slice(0, 2)
    const hTo   = habitMov.mov_uci.slice(2, 4)
    if (hFrom !== bestFrom || hTo !== bestTo) {
      customArrows.push([hFrom as Square, hTo as Square, 'red'])
    }
  }

  const totalTimes = moves.reduce((s, m) => s + m.mov_times, 0)

  const filteredGames = selectedMove
    ? games.filter(g => g.move_played === selectedMove)
    : games

  const TABS: { key: Tab; label: string }[] = [
    { key: 'moves',   label: 'Your Moves' },
    { key: 'advice',  label: 'AI Advice' },
    { key: 'history', label: 'Game History' }
  ]

  return (
    <div className="max-w-5xl mx-auto p-4">
      <MyButton onClick={() => router.back()} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:underline mb-4'>
        ← Back to Habits
      </MyButton>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: board */}
        <div className="space-y-2">
          <Chessboard
            id="position-detail"
            position={position.pos_fen}
            boardWidth={400}
            arePiecesDraggable={false}
            boardOrientation={orientation}
            customArrows={customArrows}
          />
          <div className="mt-2 border rounded-md divide-y text-sm">
            {playerName && (
              <div className="flex justify-between px-3 py-1.5">
                <span className="text-gray-500">Player</span>
                <span className="font-medium">
                  {playerName}{' '}
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                    position.pos_color === 'b'
                      ? 'bg-gray-800 text-white'
                      : 'bg-gray-100 text-gray-800 border border-gray-300'
                  }`}>{playerColor}</span>
                </span>
              </div>
            )}
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">To move</span>
              <span className="font-medium">{playerColor}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Position CP</span>
              <span className={`font-mono font-medium ${positionCp != null && positionCp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {positionCp != null ? (positionCp > 0 ? `+${positionCp}` : `${positionCp}`) : '—'}
              </span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Games</span>
              <span className="font-medium">{gameCount}</span>
            </div>
            <div className="flex justify-between px-3 py-1.5">
              <span className="text-gray-500">Best move</span>
              <span className="font-mono font-medium">
                {bestMoveSan ?? '—'}
                {positionCp != null && (
                  <span className="ml-1 text-gray-400 text-xs">({positionCp} cp)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: tabs */}
        <div className="space-y-3">
          <div className="flex border-b">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Your Moves */}
          {tab === 'moves' && (
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-400 mb-1">Click a move to filter Game History</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase text-left border-b">
                    <th className="py-1.5 pr-3">Move</th>
                    <th className="py-1.5 pr-3 text-right">Times</th>
                    <th className="py-1.5 pr-3 text-right">Win%</th>
                    <th className="py-1.5 pr-3 text-right">Loss%</th>
                    <th className="py-1.5 pr-3 text-right">CP</th>
                    <th className="py-1.5">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {moves.map(m => {
                    const badge   = cpBadge(m.mov_avg_cp)
                    const winPct  = m.mov_times > 0 ? Math.round((m.mov_wins  / m.mov_times) * 100) : 0
                    const lossPct = m.mov_times > 0 ? Math.round((m.mov_losses / m.mov_times) * 100) : 0
                    const isSelected = selectedMove === m.mov_san
                    return (
                      <tr
                        key={m.mov_san}
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onClick={() => {
                          setSelectedMove(isSelected ? null : m.mov_san)
                          setTab('history')
                        }}
                      >
                        <td className="py-1.5 pr-3 font-mono font-medium">{m.mov_san}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {m.mov_times}
                          <span className="text-gray-400 text-xs ml-1">
                            ({totalTimes > 0 ? Math.round((m.mov_times / totalTimes) * 100) : 0}%)
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-green-700">{winPct}%</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums text-red-600">{lossPct}%</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums font-mono ${m.mov_avg_cp != null && m.mov_avg_cp < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {m.mov_avg_cp != null ? (m.mov_avg_cp > 0 ? `+${m.mov_avg_cp}` : `${m.mov_avg_cp}`) : '—'}
                        </td>
                        <td className="py-1.5">
                          <span className={badge.cls}>{badge.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: AI Advice */}
          {tab === 'advice' && (
            <div className="space-y-3">
              {insight ? (
                <>
                  <h3 className="font-semibold text-gray-800">{insight.ins_theme}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{insight.ins_advice}</p>
                  <a
                    href={`/analysis/quiz?fen=${encodeURIComponent(position.pos_fen)}`}
                    className="inline-block mt-2 text-sm text-blue-600 hover:underline"
                  >
                    Practice this position →
                  </a>
                </>
              ) : (
                <div className="text-gray-400 text-sm italic">
                  No AI insight yet.{' '}
                  <a href="/api/analysis/generate-insights?limit=20" className="underline">Generate insights</a>
                </div>
              )}
            </div>
          )}

          {/* Tab: Game History */}
          {tab === 'history' && (
            <div className="overflow-x-auto">
              {selectedMove && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    Filtered: {selectedMove}
                  </span>
                  <button
                    onClick={() => setSelectedMove(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    × clear
                  </button>
                </div>
              )}
              {filteredGames.length === 0 ? (
                <p className="text-gray-400 text-sm italic">No games recorded for this position.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase text-left border-b">
                      <th className="py-1.5 pr-3">Game ID</th>
                      <th className="py-1.5 pr-3">Move</th>
                      <th className="py-1.5 pr-3 text-center">Result</th>
                      <th className="py-1.5 text-right">CP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredGames.map((g, i) => {
                      const rb       = resultBadge(g.result)
                      const canClick = g.grid != null
                      return (
                        <tr
                          key={i}
                          className={canClick ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}
                          onClick={() => canClick && router.push(`/analyze?game=${g.grid}&user=${g.player}`)}
                        >
                          <td className="py-1.5 pr-3 tabular-nums text-xs text-gray-500">
                            {g.grid ?? '—'}
                          </td>
                          <td className="py-1.5 pr-3 font-mono">{g.move_played}</td>
                          <td className="py-1.5 pr-3 text-center">
                            <span className={rb.cls}>{rb.label}</span>
                          </td>
                          <td className={`py-1.5 text-right tabular-nums font-mono ${g.cp_loss != null && g.cp_loss < 0 ? 'text-red-600' : g.cp_loss != null ? 'text-green-700' : 'text-gray-400'}`}>
                            {g.cp_loss != null ? (g.cp_loss > 0 ? `+${g.cp_loss}` : `${g.cp_loss}`) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
