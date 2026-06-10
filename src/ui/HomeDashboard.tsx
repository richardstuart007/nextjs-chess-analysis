'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MyButton } from 'nextjs-shared/MyButton'
import PlayerProfile from '@/src/ui/player/PlayerProfile'
import GameList from '@/src/ui/games/GameList'
import RatingChart from '@/src/ui/charts/RatingChart'
import OpeningScoreChart from '@/src/ui/charts/OpeningScoreChart'
import TerminationChart from '@/src/ui/charts/TerminationChart'
import MyBox from 'nextjs-shared/MyBox'
import { getPlayer, getPlayerRatings } from '@/src/lib/actions/players'
import { ChessComGame } from '@/src/lib/chesscom'

interface Player {
  username: string
  display_name: string | null
}

interface HomeDashboardProps {
  players: Player[]
  lastAnalyzedGameId?: number
}

export default function HomeDashboard({ players, lastAnalyzedGameId }: HomeDashboardProps) {
  const router = useRouter()
  const [dbPlayers,  setDbPlayers]  = useState<any[]>([])
  const [dbRatings,  setDbRatings]  = useState<Record<string, Record<string, number>>>({})
  const [tab, setTab] = useState<'games' | 'graph' | 'openings' | 'endings'>(() => {
    try { return (sessionStorage.getItem('chess-tab') as any) ?? 'games' } catch { return 'games' }
  })
  const [sharedGames, setSharedGames] = useState<any[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<string>('')

  function handlePlayerProfileClick(username: string) {
    setSelectedPlayer(prev => prev === username ? '' : username)
  }

  useEffect(() => {
    async function loadAll() {
      const [playerResults, ratingResults] = await Promise.all([
        Promise.all(players.map(p => getPlayer(p.username))),
        Promise.all(players.map(p => getPlayerRatings(p.username)))
      ])
      setDbPlayers(playerResults)
      const ratingsMap: Record<string, Record<string, number>> = {}
      players.forEach((p, i) => { ratingsMap[p.username] = ratingResults[i] })
      setDbRatings(ratingsMap)
    }
    loadAll()
  }, [players.map(p => p.username).join(',')])

  function changeTab(t: 'games' | 'graph' | 'openings' | 'endings') {
    setTab(t)
    try { sessionStorage.setItem('chess-tab', t) } catch {}
  }

  function handleSelectGame(game: ChessComGame, username: string) {
    const gameId = (game as any)._gameId
    if (gameId) {
      router.push(`/analyze?game=${gameId}&user=${encodeURIComponent(username)}`)
    }
  }

  if (players.length === 0) {
    return (
      <MyBox title='No Players'>
        <p className='text-xs text-gray-600'>
          No players in the database yet.{' '}
          <a href='/maintenance' className='text-blue-600 underline'>Go to Maintenance</a>{' '}
          to add players.
        </p>
      </MyBox>
    )
  }

  return (
    <div className='space-y-4'>
      <div className={players.length === 1 ? 'flex justify-center' : 'grid grid-cols-2 gap-3'}>
        {players.map((p, i) => {
          const db      = dbPlayers[i]
          const ratings = dbRatings[p.username] ?? {}
          return (
            <PlayerProfile
              key={p.username}
              username={db?.pl_username ?? p.username}
              displayName={db?.pl_display_name ?? undefined}
              avatar={db?.pl_avatar}
              ratings={Object.keys(ratings).length > 0 ? ratings : undefined}
              onClick={players.length > 1 ? () => handlePlayerProfileClick(p.username) : undefined}
              selected={players.length > 1 && selectedPlayer === p.username}
            />
          )
        })}
      </div>

      <div className='flex border-b border-gray-200'>
        <button
          onClick={() => changeTab('games')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'games'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Games
        </button>
        <button
          onClick={() => changeTab('graph')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'graph'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Rating
        </button>
        <button
          onClick={() => changeTab('openings')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'openings'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Openings
        </button>
        <button
          onClick={() => changeTab('endings')}
          className={`px-4 py-2 text-sm font-medium ${
            tab === 'endings'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Endings
        </button>
      </div>

      <div className={tab === 'games' ? '' : 'hidden'}>
        <GameList
          players={players.map(p => ({ username: p.username, displayName: p.display_name }))}
          onSelectGame={handleSelectGame}
          onGamesChange={setSharedGames}
          lastAnalyzedGameId={lastAnalyzedGameId}
          selectedPlayer={selectedPlayer}
          onPlayerFilterChange={setSelectedPlayer}
        />
      </div>

      <div className={tab === 'graph' ? '' : 'hidden'}>
        <RatingChart games={sharedGames} />
      </div>

      <div className={tab === 'openings' ? '' : 'hidden'}>
        <OpeningScoreChart players={players.map(p => p.username)} onSelectGame={handleSelectGame} lastAnalyzedGameId={lastAnalyzedGameId} />
      </div>

      <div className={tab === 'endings' ? '' : 'hidden'}>
        <TerminationChart players={players.map(p => p.username)} />
      </div>
    </div>
  )
}
