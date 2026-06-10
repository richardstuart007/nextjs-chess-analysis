'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import QuizMode from '@/src/ui/analysis/QuizMode'
import { getQuizQueue } from '@/src/lib/analysis/chessdb'
import { getPlayers } from '@/src/lib/actions/players'

const QUIZ_ITEMS = [
  { heading: 'How to play',       body: 'Play your move by clicking or dragging a piece on the board. The 50 highest-priority habit positions are queued up automatically.' },
  { heading: 'Reveal phase',      body: 'After your move, see how it compares: your move, your usual habit move (if different), and Stockfish\'s best move — plus AI coaching advice for that position.' },
  { heading: 'Session score',     body: 'The bar above the board tracks positions attempted, good moves played, and your average CP loss for this session.' },
  { heading: 'Specific position', body: 'To practice a particular position, open it from the Habits page — you\'ll be taken straight there.' },
]

const SESSION_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2)

function QuizContent() {
  const searchParams = useSearchParams()
  const fenParam     = searchParams.get('fen')

  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])
  const [player,  setPlayer]  = useState('')
  const [queue,   setQueue]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPlayers() {
      const ps = await getPlayers()
      setPlayers(ps)
      if (ps.length > 0) setPlayer(ps[0].username)
    }
    loadPlayers()
  }, [])

  useEffect(() => {
    if (!player) return
    setLoading(true)
    async function loadQueue() {
      const q = await getQuizQueue(50, player)
      if (fenParam) {
        const decoded = decodeURIComponent(fenParam)
        const idx = q.findIndex((p: any) => p.pos_fen === decoded)
        if (idx > 0) {
          const [item] = q.splice(idx, 1)
          q.unshift(item)
        }
      }
      setQueue(q)
      setLoading(false)
    }
    loadQueue()
  }, [player, fenParam])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Position Quiz</span>
        <select
          value={player}
          onChange={e => setPlayer(e.target.value)}
          className="border rounded px-2 py-1 text-sm font-medium"
        >
          {players.map(p => (
            <option key={p.username} value={p.username}>
              {p.display_name ?? p.username}
            </option>
          ))}
        </select>
        <MyHelp title='How to use' items={QUIZ_ITEMS} />
      </div>
      {loading
        ? <MyLoadingMessage message1="Loading quiz…" />
        : <QuizMode queue={queue} sessionId={SESSION_ID} />
      }
    </div>
  )
}

export default function QuizPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <QuizContent />
    </Suspense>
  )
}
