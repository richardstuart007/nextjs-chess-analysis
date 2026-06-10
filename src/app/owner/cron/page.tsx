'use client'

import { useState } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { runCronSync } from '@/src/lib/actions/cron'
import { runCronAnalysis } from '@/src/lib/actions/cronAnalysis'

export default function CronPage() {
  const [syncRunning,   setSyncRunning]   = useState(false)
  const [syncResult,    setSyncResult]    = useState<{ players: { username: string; inserted: number; deconstructed: number }[] } | null>(null)
  const [syncError,     setSyncError]     = useState('')

  const [analysisRunning, setAnalysisRunning] = useState(false)
  const [analysisResult,  setAnalysisResult]  = useState<{ players: { username: string; gamesProcessed: number; positions: number; treeBuilt: number; remaining: number; errors: number }[]; insightsProcessed: number; insightsErrors: number } | null>(null)
  const [analysisError,   setAnalysisError]   = useState('')

  async function handleGameSync() {
    setSyncRunning(true)
    setSyncResult(null)
    setSyncError('')
    try {
      const data = await runCronSync()
      setSyncResult(data)
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Cron sync failed')
    } finally {
      setSyncRunning(false)
    }
  }

  async function handleAnalysisPipeline() {
    setAnalysisRunning(true)
    setAnalysisResult(null)
    setAnalysisError('')
    try {
      const data = await runCronAnalysis()
      setAnalysisResult(data)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis pipeline failed')
    } finally {
      setAnalysisRunning(false)
    }
  }

  return (
    <div className='space-y-4'>

      <h2 className='text-sm font-bold text-gray-800'>Cron Jobs</h2>

      {/* Game Sync */}
      <MyBox title='Game Sync — All Players'>
        <div className='flex items-center gap-2 mb-2'>
          <MyButton onClick={handleGameSync} disabled={syncRunning}>
            {syncRunning ? 'Running...' : 'Run Game Sync'}
          </MyButton>
          <MyHelpField text='Runs steps 1 (rating stats from latest downloaded game), 2 (New Games Download), and 3 (Populate) for ALL players in one go. Step 1 here reads from the database — to refresh from chess.com, run step 1 manually per player on the Maintenance page.' />
        </div>
        {syncError && <p className='text-xs text-red-600'>{syncError}</p>}
        {syncResult && (
          <div className='mt-2 text-xs text-gray-700 space-y-1'>
            {syncResult.players.map(p => (
              <div key={p.username}>
                {p.username}: {p.inserted} inserted, {p.deconstructed} deconstructed
              </div>
            ))}
          </div>
        )}
      </MyBox>

      {/* Analysis Pipeline */}
      <MyBox title='Analysis Pipeline — All Players'>
        <div className='flex items-center gap-2 mb-2'>
          <MyButton onClick={handleAnalysisPipeline} disabled={analysisRunning}>
            {analysisRunning ? 'Running...' : 'Run Analysis Pipeline'}
          </MyButton>
          <MyHelpField text='Builds the position tree for all players then generates AI insights. Requires Stockfish Analysis (Analysis › Stockfish tab) to have been run first. Run after Game Sync.' />
        </div>
        {analysisError && <p className='text-xs text-red-600'>{analysisError}</p>}
        {analysisResult && (
          <div className='mt-2 text-xs text-gray-700 space-y-1'>
            {analysisResult.players.map(p => (
              <div key={p.username}>
                {p.username}: {p.gamesProcessed} games, {p.positions} positions, {p.treeBuilt} built
                {p.errors > 0 && <span className='text-red-500 ml-1'>({p.errors} errors)</span>}
              </div>
            ))}
            <div className='text-gray-500 pt-1'>
              AI insights: {analysisResult.insightsProcessed} generated
              {analysisResult.insightsErrors > 0 && <span className='text-red-500 ml-1'>({analysisResult.insightsErrors} errors)</span>}
            </div>
          </div>
        )}
      </MyBox>

    </div>
  )
}
