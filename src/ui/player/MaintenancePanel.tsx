'use client'

import { useState } from 'react'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import MyBox from 'nextjs-shared/MyBox'
import { MyConfirmDialog, ConfirmDialogInt } from 'nextjs-shared/MyConfirmDialog'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import SyncProgress, { SyncProgressData } from '@/src/ui/player/SyncProgress'
import { deconstructGames } from '@/src/lib/actions/deconstruct'

interface MaintenancePanelProps {
  username: string
  players: { username: string; display_name: string | null }[]
  rawCount: number
  undeconCount: number
  ratings: { timeClass: string; rating: number }[]
  onSearch: (username: string) => void
  onSync: (type: 'full_replace' | 'refresh') => void
  onDeconComplete: () => void
  onSyncComplete: () => void
  loading: boolean
  syncing: boolean
  syncProgress: SyncProgressData | null
  error: string
}

const CONFIRM_INITIAL: ConfirmDialogInt = {
  isOpen: false,
  title: '',
  subTitle: '',
  onConfirm: () => {}
}

export default function MaintenancePanel({
  username: initialUsername,
  players,
  rawCount,
  undeconCount,
  ratings,
  onSearch,
  onSync,
  onDeconComplete,
  onSyncComplete,
  loading,
  syncing,
  syncProgress,
  error
}: MaintenancePanelProps) {
  const [username, setUsername] = useState(initialUsername)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogInt>(CONFIRM_INITIAL)

  const [populating, setPopulating] = useState(false)
  const [populateResult, setPopulateResult] = useState<{ processed: number; skipped: number; errors: number } | null>(null)

  function handleSubmit() {
    const trimmed = username.trim()
    if (!trimmed) return
    onSearch(trimmed)
  }

  function handleFullReplace() {
    setConfirmDialog({
      isOpen: true,
      title: 'Full Replace',
      subTitle: 'This will DELETE all games and re-download from chess.com',
      line1: `Player: ${initialUsername}`,
      line2: `Games to delete: ${rawCount}`,
      line3: 'This cannot be undone',
      onConfirm: () => {
        setConfirmDialog(CONFIRM_INITIAL)
        onSync('full_replace')
      }
    })
  }

  async function handlePopulate() {
    setPopulating(true)
    setPopulateResult(null)
    const batchSize = 500
    const accumulated = { processed: 0, skipped: 0, errors: 0 }

    try {
      while (true) {
        const res = await deconstructGames(initialUsername, batchSize)
        accumulated.processed += res.processed
        accumulated.skipped += res.skipped
        accumulated.errors += res.errors
        setPopulateResult({ ...accumulated })
        if (res.processed === 0) break
      }
      onDeconComplete()
    } catch {
      setPopulateResult({ ...accumulated, errors: accumulated.errors + 1 })
    } finally {
      setPopulating(false)
    }
  }

  const deconCount = rawCount - undeconCount

  return (
    <>
      {/* Header */}
      <div className='flex items-center gap-2 mb-2'>
        <h2 className='text-sm font-bold text-gray-800'>Maintenance</h2>
        <MyHelp
          label='Help'
          title='Maintenance — complete flow'
          items={[
            { heading: 'Run steps 1–3 for each player',  body: 'Steps 1 to 3 must be completed for every player. Use Cron Sync (step 4) to do all players at once.' },
            { heading: '1. Player Statistics (tplr_player_ratings)',           body: 'Per player. Click "Update Player Rating Statistics" to fetch the player\'s current ratings from chess.com and save them to the database. Also shows the current raw game and populated counts.' },
            { heading: '2. New Games Download',           body: 'Per player. Pulls this month\'s new blitz and rapid games from chess.com. Writes to: tgr_gamesraw (one raw PGN row per game).' },
            { heading: '3. Populate',                    body: 'Per player. Parses raw PGN rows into structured data. Writes to: tgd_gamesdecon (opening, ECO, result, ratings, termination) and tec_ecoreference. Until this runs, downloaded games are invisible to the games list and all analysis.' },
            { heading: '4. Cron Sync',                   body: 'All players. Runs steps 1 (updates rating stats from the latest downloaded game), 2, and 3 automatically for every player. Use this for routine updates instead of repeating steps 1–3 manually.' },
          ]}
        />
      </div>

      {/* 1. Player Statistics (tplr_player_ratings) */}
      <MyBox title='1. Player Statistics (tplr_player_ratings)'>
        <div className='space-y-2'>
          <div className='flex items-end gap-2'>
            <div>
              <select
                value={username}
                onChange={e => setUsername(e.target.value)}
                className='rounded border border-gray-300 px-2 py-1 text-xs text-gray-700'
              >
                {players.map(p => (
                  <option key={p.username} value={p.username}>
                    {p.display_name ? `${p.display_name} (${p.username})` : p.username}
                  </option>
                ))}
              </select>
            </div>
            <MyButton onClick={handleSubmit} disabled={loading}>
              {loading ? 'Loading...' : 'Update Player Rating Statistics'}
            </MyButton>
            <MyHelpField text="Fetches the selected player's current ratings for each time class (blitz, rapid) from chess.com and saves them to the database (tplr_player_ratings). Also shows the current raw game count and how many have been Populated. Does not download or change any game data." />
          </div>
          {error && <p className='text-xs text-red-600'>{error}</p>}
          {loading && <MyLoadingMessage message1='Loading player...' />}
          {!loading && ratings.length > 0 && (
            <div className='flex items-center gap-4'>
              {ratings.map(r => (
                <p key={r.timeClass} className='text-xs text-gray-700 capitalize'>
                  {r.timeClass}: <span className='font-bold'>{r.rating.toLocaleString()}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </MyBox>

      {/* 2. New Games Download */}
      {!loading && (
        <MyBox title='2. New Games Download'>
          <div className='space-y-2'>
            <div className='flex items-center gap-3'>
              <p className='text-xs text-gray-700'>
                Raw games: <span className='font-bold'>{rawCount.toLocaleString()}</span>
              </p>
              <MyButton
                onClick={() => onSync('refresh')}
                disabled={syncing}
                overrideClass='text-xxs'
              >
                {syncing ? 'Downloading...' : 'Download'}
              </MyButton>
              <MyHelpField text="Downloads only this month's chess.com archive for this player. Games already in the database are skipped by date and UUID check. Only blitz and rapid games are stored — other time classes are ignored. Previous months are never re-checked; use a Full Replace if you need to rebuild from scratch." />
            </div>
            {syncProgress && (
              <SyncProgress progress={syncProgress} onComplete={onSyncComplete} />
            )}
          </div>
        </MyBox>
      )}

      {/* 3. Populate */}
      {rawCount > 0 && !loading && (
        <MyBox title='3. Populate'>
          <div className='space-y-1'>
            <div className='flex items-center gap-3'>
              <p className='text-xs text-gray-700'>
                Deconstructed: <span className={`font-bold ${deconCount > 0 ? 'text-green-600' : ''}`}>
                  {deconCount.toLocaleString()}
                </span>
                <span className='text-gray-400 ml-1'>
                  ({undeconCount.toLocaleString()} remaining)
                </span>
              </p>
              <MyButton
                onClick={handlePopulate}
                disabled={populating}
                overrideClass='text-xxs'
              >
                {populating ? 'Processing...' : 'Populate'}
              </MyButton>
              <MyHelpField text='Parses raw PGN game data for this player and writes structured rows into the games table — extracting opening name, ECO code, result, player colours, ratings, and termination type. Until this is run, downloaded games are invisible to the games list, charts, and analysis features. Runs in batches of 500; click once and it repeats automatically until the remaining count reaches zero.' />
            </div>
            {populateResult && (
              <p className='text-xxs'>
                <span className='text-green-600 font-bold'>Processed: {populateResult.processed}</span>
                {populateResult.skipped > 0 && <span className='ml-2 text-gray-500'>Skipped: {populateResult.skipped}</span>}
                {populateResult.errors > 0 && <span className='ml-2 text-red-600'>Errors: {populateResult.errors}</span>}
              </p>
            )}
          </div>
        </MyBox>
      )}

      <MyConfirmDialog
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
      />
    </>
  )
}
