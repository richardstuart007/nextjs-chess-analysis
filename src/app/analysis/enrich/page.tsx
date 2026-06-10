'use client'

import { Suspense, useState, useEffect } from 'react'
import { MyLoadingMessage } from 'nextjs-shared/MyLoadingMessage'
import { MyHelp } from 'nextjs-shared/MyHelp'
import { MyHelpField } from 'nextjs-shared/MyHelpField'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import EvalProgress from '@/src/ui/analysis/EvalProgress'

const ENRICH_ITEMS = [
  { heading: 'What this does',     body: 'Runs Stockfish (a chess engine) in your browser on each selected game. For every move it calculates how much worse your move was vs the best move, in centipawns (100 cp ≈ 1 pawn). Results are saved to the database.' },
  { heading: 'What gets computed', body: 'Average CP loss, blunders (>200 cp), mistakes (>100 cp), the critical move (largest single drop), game phase of the critical moment (opening/middlegame/endgame), lead changes (volatility), and whether you lost on time from a winning position.' },
  { heading: 'Keep this tab open', body: 'Stockfish runs entirely in this browser tab — do not close or navigate away until enrichment completes. Results power the Habits and Briefing pages.' },
  { heading: 'Pipeline position',  body: 'Run this after syncing games from chess.com (Maintenance page). Then build the position tree and generate insights via the links on the Habits page.' },
]
import { getPlayers } from '@/src/lib/actions/players'
import { getUnenrichedGamesForPlayer, type UnenrichedGame, type EnrichFilters } from '@/src/lib/analysis/chessdb'

// ---- Helpers ---------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10)
const THIS_YEAR = new Date().getFullYear()

function ResultBadge({ result }: { result: string }) {
  const cls =
    result === 'win'  ? 'bg-green-100 text-green-700' :
    result === 'loss' ? 'bg-red-100 text-red-600'     :
                        'bg-gray-100 text-gray-600'
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{result}</span>
}

function ColorDot({ color }: { color: string }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full mr-1 ${color === 'white' ? 'bg-gray-200 border border-gray-400' : 'bg-gray-800'}`} />
  )
}

// ---- Main component --------------------------------------------------------

function EnrichContent() {
  const [players,        setPlayers]        = useState<{ username: string; display_name: string | null }[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [depth,          setDepth]          = useState(16)

  // Filters — matching the main games display
  const [dateFrom, setDateFrom] = useState(`${THIS_YEAR}-01-01`)
  const [dateTo,   setDateTo]   = useState(TODAY)
  const [color,    setColor]    = useState<'' | 'white' | 'black'>('')
  const [opening,  setOpening]  = useState('')
  const [eco,      setEco]      = useState('')

  const [allGames,  setAllGames]  = useState<UnenrichedGame[]>([])
  const [selected,  setSelected]  = useState<Set<number>>(new Set())
  const [loading,   setLoading]   = useState(false)
  const [loaded,    setLoaded]    = useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    getPlayers().then(ps => {
      setPlayers(ps)
      if (ps.length > 0) setSelectedPlayer(ps[0].username)
    })
  }, [])

  async function handleLoad() {
    if (!selectedPlayer) return
    setLoading(true)
    setLoaded(false)
    setDone(false)
    setAllGames([])
    setSelected(new Set())
    try {
      const filters: EnrichFilters = {
        dateFrom: dateFrom || undefined,
        dateTo:   dateTo   || undefined,
        color:    color    || undefined,
        opening:  opening  || undefined,
        eco:      eco      || undefined
      }
      const rows = await getUnenrichedGamesForPlayer(selectedPlayer, 0, undefined, undefined, filters)
      setAllGames(rows)
      setSelected(new Set(rows.map(r => r.grid)))
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setDateFrom(`${THIS_YEAR}-01-01`)
    setDateTo(TODAY)
    setColor('')
    setOpening('')
    setEco('')
  }

  function toggleAll() {
    setSelected(s => s.size === allGames.length ? new Set() : new Set(allGames.map(g => g.grid)))
  }

  function toggleOne(grid: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(grid) ? next.delete(grid) : next.add(grid)
      return next
    })
  }

  const selectedGames = allGames.filter(g => selected.has(g.grid))

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Stockfish Analysis</h1>
          <MyHelp label='Help' title='Stockfish Analysis (ten_enrichment)' items={ENRICH_ITEMS} />
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Select games then run Stockfish in your browser to compute accuracy, blunders and more.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          {/* Player */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Player</label>
            <MySelect value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}
              overrideClass='w-full'>
              {players.map(p => (
                <option key={p.username} value={p.username}>{p.display_name ?? p.username}</option>
              ))}
            </MySelect>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <MySelect value={color} onChange={e => setColor(e.target.value as '' | 'white' | 'black')}
              overrideClass='w-full'>
              <option value="">All</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </MySelect>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date from</label>
            <MyInput type="date" value={dateFrom} max={TODAY}
              onChange={e => setDateFrom(e.target.value)}
              overrideClass='w-full' />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date to</label>
            <MyInput type="date" value={dateTo} max={TODAY}
              onChange={e => setDateTo(e.target.value)}
              overrideClass='w-full' />
          </div>

          {/* Opening */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Opening name</label>
            <MyInput type="text" value={opening} placeholder="e.g. Sicilian…"
              onChange={e => setOpening(e.target.value)}
              overrideClass='w-full' />
          </div>

          {/* ECO */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ECO code</label>
            <MyInput type="text" value={eco} placeholder="e.g. B20"
              onChange={e => setEco(e.target.value)}
              overrideClass='w-full' />
          </div>

          {/* Depth */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Stockfish depth <MyHelpField text="Depth 16 is recommended — good balance of speed and accuracy. Depth 20+ is more thorough but much slower. Depth 8–12 is fast but less reliable." />
            </label>
            <MyInput type="number" value={depth} min={8} max={24}
              onChange={e => setDepth(Math.min(24, parseInt(e.target.value) || 16))}
              overrideClass='w-full' />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <MyButton onClick={handleLoad} disabled={loading || !selectedPlayer}>
            {loading ? 'Loading…' : 'Load games'}
          </MyButton>
          <MyButton onClick={handleReset} overrideClass='bg-transparent hover:bg-gray-50 text-gray-600 border border-gray-300'>
            Reset filters
          </MyButton>
        </div>
      </div>

      {/* ── Game list ── */}
      {loaded && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              {allGames.length} game{allGames.length !== 1 ? 's' : ''} found
              {allGames.length > 0 && <> · <strong>{selected.size}</strong> selected</>}
            </span>
            {allGames.length > 0 && (
              <MyButton onClick={toggleAll} overrideClass='h-auto bg-transparent hover:bg-transparent text-blue-600 hover:underline'>
                {selected.size === allGames.length ? 'Deselect all' : 'Select all'}
              </MyButton>
            )}
          </div>

          {allGames.length === 0 ? (
            <p className="px-4 py-8 text-sm text-gray-500 text-center">
              No unenriched games found for these filters.
            </p>
          ) : (
            <div className="overflow-y-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Color</th>
                    <th className="px-3 py-2 text-left">Opponent</th>
                    <th className="px-3 py-2 text-left">Result</th>
                    <th className="px-3 py-2 text-left">Opening</th>
                    <th className="px-3 py-2 text-left">ECO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allGames.map(g => (
                    <tr key={g.grid} onClick={() => toggleOne(g.grid)}
                      className={`cursor-pointer hover:bg-gray-50 ${selected.has(g.grid) ? '' : 'opacity-50'}`}>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={selected.has(g.grid)}
                          onChange={() => toggleOne(g.grid)}
                          onClick={e => e.stopPropagation()} className="rounded" />
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-gray-600 whitespace-nowrap">{g.end_date}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center">
                          <ColorDot color={g.color} />
                          <span className="text-gray-600 capitalize">{g.color}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-gray-800">{g.opponent}</td>
                      <td className="px-3 py-1.5"><ResultBadge result={g.result} /></td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate">{g.opening_name || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-400 font-mono text-xs">{g.eco_code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Enrich panel ── */}
      {loaded && selectedGames.length > 0 && !done && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Run Stockfish Analysis</h2>
            <span className="text-xs text-gray-500">
              depth {depth} · {selectedGames.length} game{selectedGames.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Runs entirely in your browser — keep this tab open until complete.
          </p>
          <EvalProgress
            mode="enrich"
            games={selectedGames}
            depth={depth}
            onComplete={() => setDone(true)}
          />
        </div>
      )}

      {done && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          Stockfish analysis complete. Visit{' '}
          <a href="/analysis/habits" className="underline">Habits</a> or{' '}
          <a href="/analysis/briefing" className="underline">Briefing</a> to see the results.
        </div>
      )}
    </div>
  )
}

export default function EnrichPage() {
  return (
    <Suspense fallback={<MyLoadingMessage message1="Loading…" />}>
      <EnrichContent />
    </Suspense>
  )
}
