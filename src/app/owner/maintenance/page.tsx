'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import MaintenancePanel from '@/src/ui/player/MaintenancePanel'
import { SyncProgressData } from '@/src/ui/player/SyncProgress'
import { getPlayer, upsertPlayer, getPlayers, upsertPlayerRating } from '@/src/lib/actions/players'
import { getGameCount } from '@/src/lib/actions/games'
import { getUndeconstructedCount } from '@/src/lib/actions/deconstruct'
import { initSync, syncArchive } from '@/src/lib/actions/sync'
import { ChessComPlayer, fetchPlayer, fetchPlayerStats } from '@/src/lib/chesscom'
import { DEFAULT_PLAYER, INCLUDED_TIME_CLASSES } from '@/src/lib/constants'

export default function MaintenancePage() {
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])
  const [player, setPlayer] = useState<ChessComPlayer | null>(null)

  useEffect(() => {
    getPlayers().then(setPlayers)
  }, [])

  const [gameCount,    setGameCount]    = useState(0)
  const [undeconCount, setUndeconCount] = useState(0)
  const [ratings,      setRatings]      = useState<{ timeClass: string; rating: number }[]>([])
  const [loading,      setLoading]      = useState(false)
  const [syncing,      setSyncing]      = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgressData | null>(null)
  const [error,        setError]        = useState('')

  async function handleSearch(username: string) {
    setError('')
    setLoading(true)
    setPlayer(null)
    setGameCount(0)
    setUndeconCount(0)
    setRatings([])

    try {
      const [playerData, statsData] = await Promise.all([
        fetchPlayer(username),
        fetchPlayerStats(username)
      ])

      setPlayer(playerData)

      const ratingsFlat: Record<string, number> = {}
      for (const [key, val] of Object.entries(statsData)) {
        ratingsFlat[key] = (val as any).last.rating
      }

      const ratingData = INCLUDED_TIME_CLASSES.map(tc => ({ timeClass: tc, rating: ratingsFlat[tc] ?? 0 }))
      setRatings(ratingData)

      await upsertPlayer({
        username: playerData.username.toLowerCase(),
        avatar: playerData.avatar,
        display_name: playerData.name,
      })
      for (const { timeClass, rating } of ratingData) {
        if (rating > 0) await upsertPlayerRating(playerData.username.toLowerCase(), timeClass, rating)
      }

      const [rawCount, undecon] = await Promise.all([
        getGameCount(username),
        getUndeconstructedCount(username)
      ])
      setGameCount(rawCount)
      setUndeconCount(undecon)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch player data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync(syncType: 'full_replace' | 'refresh') {
    if (!player) return
    setSyncing(true)
    setSyncProgress(null)
    setError('')

    try {
      const { archives, latestEndTime } = await initSync(player.username, syncType)

      setSyncProgress({
        syncType,
        status: 'running',
        archivesDone: 0,
        archivesTotal: archives.length,
        gamesInserted: 0,
        gamesSkipped: 0
      })

      let totalInserted = 0
      let totalSkipped = 0

      for (let i = 0; i < archives.length; i++) {
        const result = await syncArchive({
          username: player.username,
          archiveUrl: archives[i],
          syncType,
          latestEndTime
        })

        totalInserted += result.inserted
        totalSkipped += result.skipped

        setSyncProgress({
          syncType,
          status: 'running',
          archivesDone: i + 1,
          archivesTotal: archives.length,
          gamesInserted: totalInserted,
          gamesSkipped: totalSkipped
        })
      }

      setSyncProgress(prev => prev ? { ...prev, status: 'completed' } : null)
      setSyncing(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed'
      setError(msg)
      setSyncProgress(prev => prev ? { ...prev, status: 'failed', errorMessage: msg } : null)
      setSyncing(false)
    }
  }

  async function handleSyncComplete() {
    setSyncing(false)
    setSyncProgress(null)
    if (player) {
      const [, rawCount] = await Promise.all([
        getPlayer(player.username),
        getGameCount(player.username)
      ])
      setGameCount(rawCount)
    }
  }

  async function handleDeconComplete() {
    if (player) {
      const undecon = await getUndeconstructedCount(player.username)
      setUndeconCount(undecon)
    }
  }

  return (
    <div className='space-y-4'>

      <MaintenancePanel
        username={player?.username ?? DEFAULT_PLAYER}
        players={players}
        rawCount={gameCount}
        undeconCount={undeconCount}
        ratings={ratings}
        onSearch={handleSearch}
        onSync={handleSync}
        onDeconComplete={handleDeconComplete}
        onSyncComplete={handleSyncComplete}
        loading={loading}
        syncing={syncing}
        syncProgress={syncProgress}
        error={error}
      />

      {player && gameCount === 0 && !syncing && !loading && (
        <MyBox title='No Games Found'>
          <p className='text-xs text-gray-600 mb-2'>
            No games in the database for {player.username}. Download all games from chess.com?
          </p>
          <MyButton onClick={() => handleSync('full_replace')}>
            Download All Games
          </MyButton>
        </MyBox>
      )}
    </div>
  )
}
