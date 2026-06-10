'use client'

import { useState, useEffect } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { getPlayers } from '@/src/lib/actions/players'

const HELP_ITEMS = [
  { heading: '1. Build Position Tree', body: 'Processes deconstructed games for the selected player into a position tree — recording every FEN position reached and every move played from it. Run this after syncing and populating games. Runs in batches; click repeatedly until no new positions are reported.' },
  { heading: '2. Generate AI Insights', body: 'Sends positions (that already have Stockfish evaluations from Stockfish Analysis) to Claude AI to generate coaching advice. Run after Stockfish Analysis and Build Position Tree. Each batch targets the top positions by priority. Repeat until the count reaches zero.' },
  { heading: 'After both steps',       body: 'Habits, Quiz, and Briefing pages will reflect the latest data.' },
]

export default function PipelinePage() {
  const [players, setPlayers] = useState<{ username: string; display_name: string | null }[]>([])

  const [treePlayer,  setTreePlayer]  = useState('')
  const [treeLimit,   setTreeLimit]   = useState('500')
  const [treeMinMove, setTreeMinMove] = useState('3')
  const [treeMaxMove, setTreeMaxMove] = useState('25')
  const [treeRunning, setTreeRunning] = useState(false)
  const [treeResult,  setTreeResult]  = useState<{ ok: boolean; gamesProcessed?: number; positions?: number; moves?: number; errors?: number; treeBuilt?: number; remaining?: number; error?: string } | null>(null)

  const [insightsLimit,   setInsightsLimit]   = useState('20')
  const [insightsRunning, setInsightsRunning] = useState(false)
  const [insightsResult,  setInsightsResult]  = useState<{ ok: boolean; processed?: number; errors?: number; error?: string } | null>(null)

  useEffect(() => {
    async function load() {
      const ps = await getPlayers()
      setPlayers(ps)
      if (ps.length > 0) setTreePlayer(ps[0].username)
    }
    load()
  }, [])

  async function handleBuildTree() {
    setTreeRunning(true)
    setTreeResult(null)
    try {
      const params = new URLSearchParams({ limit: treeLimit, minMove: treeMinMove, maxMove: treeMaxMove })
      if (treePlayer) params.set('player', treePlayer)
      const res = await fetch(`/api/analysis/build-tree?${params}`)
      const data = await res.json()
      setTreeResult(data)
    } catch (err) {
      setTreeResult({ ok: false, error: String(err) })
    } finally {
      setTreeRunning(false)
    }
  }

  async function handleGenerateInsights() {
    setInsightsRunning(true)
    setInsightsResult(null)
    try {
      const res = await fetch(`/api/analysis/generate-insights?limit=${insightsLimit}`)
      const data = await res.json()
      setInsightsResult(data)
    } catch (err) {
      setInsightsResult({ ok: false, error: String(err) })
    } finally {
      setInsightsRunning(false)
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-2 mb-2'>
        <h2 className='text-sm font-bold text-gray-800'>Analysis Pipeline</h2>
        <MyHelp label='Help' title='Analysis Pipeline' items={HELP_ITEMS} />
      </div>

      {/* 1. Build Position Tree */}
      <MyBox title='1. Build Position Tree'>
        <div className='space-y-2'>
          <div className='flex items-end gap-2'>
            {players.length > 0 && (
              <div>
                <p className='text-xxs text-gray-500 mb-0.5'>Player</p>
                <MySelect
                  value={treePlayer}
                  onChange={e => setTreePlayer(e.target.value)}
                  overrideClass='w-auto'
                >
                  {players.map(p => (
                    <option key={p.username} value={p.username}>
                      {p.display_name ? `${p.display_name} (${p.username})` : p.username}
                    </option>
                  ))}
                </MySelect>
              </div>
            )}
            <div>
              <p className='text-xxs text-gray-500 mb-0.5'>From move</p>
              <MySelect
                value={treeMinMove}
                onChange={e => setTreeMinMove(e.target.value)}
                overrideClass='w-auto'
              >
                <option value='3'>Move 3</option>
                <option value='4'>Move 4</option>
                <option value='5'>Move 5</option>
                <option value='6'>Move 6</option>
              </MySelect>
            </div>
            <div>
              <p className='text-xxs text-gray-500 mb-0.5'>To move</p>
              <MySelect
                value={treeMaxMove}
                onChange={e => setTreeMaxMove(e.target.value)}
                overrideClass='w-auto'
              >
                <option value='6'>Move 6</option>
                <option value='10'>Move 10</option>
                <option value='15'>Move 15</option>
                <option value='25'>Move 25</option>
              </MySelect>
            </div>
            <div>
              <p className='text-xxs text-gray-500 mb-0.5'>Batch size</p>
              <MySelect
                value={treeLimit}
                onChange={e => setTreeLimit(e.target.value)}
                overrideClass='w-auto'
              >
                <option value='100'>100</option>
                <option value='500'>500</option>
                <option value='1000'>1000</option>
                <option value='5000'>5000</option>
                <option value='0'>All unprocessed</option>
              </MySelect>
            </div>
            <MyButton onClick={handleBuildTree} disabled={treeRunning}>
              {treeRunning ? 'Building...' : 'Build Position Tree'}
            </MyButton>
            <MyHelpField text='Processes games into the position tree using chess.js only — no Stockfish needed. Safe to re-run; already-processed games are skipped. Run with "All unprocessed" to include all 38K games.' />
          </div>
          {treeResult && (
            <p className={`text-xs ${treeResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {treeResult.ok
                ? `Done — ${treeResult.gamesProcessed} games processed, ${treeResult.positions} positions, ${treeResult.moves} moves${treeResult.errors ? `, ${treeResult.errors} errors` : ''}${treeResult.remaining != null ? ` · ${treeResult.remaining.toLocaleString()} remaining` : ''}`
                : `Error: ${treeResult.error}`}
            </p>
          )}
        </div>
      </MyBox>

      {/* 2. Generate AI Insights */}
      <MyBox title='2. Generate AI Insights'>
        <div className='space-y-2'>
          <div className='flex items-end gap-2'>
            <div>
              <p className='text-xxs text-gray-500 mb-0.5'>Batch size</p>
              <MyInput
                type='number'
                value={insightsLimit}
                onChange={e => setInsightsLimit(e.target.value)}
                min={1}
                max={100}
                overrideClass='w-20'
              />
            </div>
            <MyButton onClick={handleGenerateInsights} disabled={insightsRunning}>
              {insightsRunning ? 'Generating...' : 'Generate AI Insights'}
            </MyButton>
            <MyHelpField text='Sends positions with Stockfish evaluations to Claude AI to generate coaching advice. Requires Stockfish Analysis and Build Position Tree to have been run first. Repeat until processed count reaches zero.' />
          </div>
          {insightsResult && (
            <p className={`text-xs ${insightsResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {insightsResult.ok
                ? `Done — ${insightsResult.processed} insights generated${insightsResult.errors ? `, ${insightsResult.errors} errors` : ''}`
                : `Error: ${insightsResult.error}`}
            </p>
          )}
        </div>
      </MyBox>
    </div>
  )
}
