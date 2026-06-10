'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyButton } from 'nextjs-shared/MyButton'
import ChessBoardView from '@/src/ui/board/ChessBoardView'
import { ChessComGame } from '@/src/lib/chesscom'
import { getGameById, getGameEvals } from '@/src/lib/actions/games'
import { STOCKFISH_DEFAULTS } from '@/src/lib/stockfish'

function AnalyzeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const gameId = searchParams.get('game')
  const username = searchParams.get('user') ?? ''
  const isFree = searchParams.get('mode') === 'free'

  const [game, setGame] = useState<ChessComGame | null>(null)
  const [gameRef, setGameRef] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [stockfishDepth, setStockfishDepth] = useState(STOCKFISH_DEFAULTS.depth)
  const [stockfishMultiPv, setStockfishMultiPv] = useState(STOCKFISH_DEFAULTS.multiPv)

  useEffect(() => {
    if (isFree) return

    if (!gameId) {
      setError('No game specified')
      return
    }

    async function loadGame() {
      setLoading(true)
      try {
        const row = await getGameById(parseInt(gameId!, 10))
        if (!row) {
          setError('Game not found')
          return
        }

        const raw = typeof row.gr_raw_data === 'string'
          ? JSON.parse(row.gr_raw_data)
          : row.gr_raw_data

        const storedEvals = await getGameEvals(row.gr_chesscom_uuid, row.gr_player_username)
        setGame({
          ...raw,
          _evaluations: storedEvals.length > 0 ? storedEvals : null
        } as ChessComGame)
        setGameRef(row.gr_chesscom_uuid)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game')
      } finally {
        setLoading(false)
      }
    }

    loadGame()
  }, [gameId, isFree])

  function handleBack() {
    router.push(gameId ? `/?highlight=${gameId}` : '/')
  }

  if (loading) {
    return <MyLoadingMessage message1='Loading game...' />
  }

  if (error) {
    return (
      <div className='text-center py-8'>
        <p className='text-red-600 text-sm'>{error}</p>
        <MyButton onClick={handleBack} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-500 underline mt-2'>
          Back to games
        </MyButton>
      </div>
    )
  }

  return (
    <ChessBoardView
      game={isFree ? undefined : (game ?? undefined)}
      gameRef={gameRef}
      username={username}
      stockfishDepth={stockfishDepth}
      stockfishMultiPv={stockfishMultiPv}
      onStockfishDepthChange={setStockfishDepth}
      onStockfishMultiPvChange={setStockfishMultiPv}
      onBack={handleBack}
    />
  )
}

export default function AnalyzePage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1='Loading...' />}>
      <AnalyzeContent />
    </Suspense>
  )
}
