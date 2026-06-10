'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import MyBox from 'nextjs-shared/MyBox'
import { MyButton } from 'nextjs-shared/MyButton'
import { MyInput } from 'nextjs-shared/MyInput'
import MySelect from 'nextjs-shared/MySelect'
import MyPagination from 'nextjs-shared/MyPagination'
import { ChessComGame } from '@/src/lib/chesscom'
import {
  fetchFilteredGames,
  getEarliestGameDate,
  GameFilters
} from '@/src/lib/actions/games'
import { DEFAULT_DATE_FROM } from '@/src/lib/constants'

interface PlayerOption {
  username: string
  displayName: string | null
}

interface GameListProps {
  players: PlayerOption[]
  onSelectGame: (game: ChessComGame, username: string) => void
  onGamesChange?: (games: any[]) => void
  lastAnalyzedGameId?: number
  selectedPlayer?: string
  onPlayerFilterChange?: (player: string) => void
}

const RESULT_STYLES: Record<string, string> = {
  win: 'text-green-600 font-bold',
  loss: 'text-red-600 font-bold',
  draw: 'text-gray-500 font-bold'
}

const BOTH = ''

const TODAY = new Date().toISOString().slice(0, 10)

function ss<T>(key: string, fallback: T): T {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}

export default function GameList({ players, onSelectGame, onGamesChange, lastAnalyzedGameId, selectedPlayer, onPlayerFilterChange }: GameListProps) {
  const hasMultiple = players.length > 1
  const playerFilterOptions = hasMultiple ? [BOTH, ...players.map(p => p.username)] : players.map(p => p.username)

  const [playerFilter, setPlayerFilter] = useState(() => {
    const saved = ss<string>('chess-gl-playerFilter', '')
    if (saved === 'Both' || saved === '') return hasMultiple ? BOTH : (players[0]?.username ?? '')
    if (players.some(p => p.username === saved)) return saved
    return hasMultiple ? BOTH : (players[0]?.username ?? '')
  })

  const lastExternalPlayer = useRef(selectedPlayer)
  useEffect(() => {
    if (selectedPlayer !== undefined && selectedPlayer !== lastExternalPlayer.current) {
      lastExternalPlayer.current = selectedPlayer
      setPlayerFilter(selectedPlayer)
      setCurrentPage(1)
    }
  }, [selectedPlayer])
  const [filters, setFilters] = useState<GameFilters>(() => ss('chess-gl-filters', { dateFrom: DEFAULT_DATE_FROM }))
  const [currentPage, setCurrentPage] = useState(() => ss('chess-gl-page', 1))
  const [itemsPerPage, setItemsPerPage] = useState(() => { const v = ss<number>('chess-gl-items', 25); return v === 15 ? 25 : v })
  const [allGames, setAllGames] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [minDate, setMinDate] = useState<string | undefined>()

  const playerUsernames = players.map(p => p.username).join(',')

  useEffect(() => {
    try {
      sessionStorage.setItem('chess-gl-filters', JSON.stringify(filters))
      sessionStorage.setItem('chess-gl-playerFilter', JSON.stringify(playerFilter))
      sessionStorage.setItem('chess-gl-page', JSON.stringify(currentPage))
      sessionStorage.setItem('chess-gl-items', JSON.stringify(itemsPerPage))
    } catch {}
  }, [filters, playerFilter, currentPage, itemsPerPage])

  useEffect(() => {
    async function fetchMin() {
      const min = await getEarliestGameDate(players.map(p => p.username))
      if (min) setMinDate(min)
    }
    fetchMin()
  }, [playerUsernames])

  function updateFilter(key: keyof GameFilters, value: string) {
    setFilters(prev => {
      const next = { ...prev }
      if (value === '' || value === undefined) {
        delete next[key]
      } else if (key === 'opponentRatingMin' || key === 'opponentRatingMax') {
        (next as any)[key] = parseInt(value, 10) || undefined
      } else {
        (next as any)[key] = value
      }
      return next
    })
    setCurrentPage(1)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function fetchAll() {
      const usernamesToFetch = players.length === 1
        ? [players[0].username]
        : playerFilter
          ? [playerFilter]
          : players.map(p => p.username)

      if (usernamesToFetch.length === 0) {
        if (!cancelled) { setAllGames([]); onGamesChange?.([]); setLoading(false) }
        return
      }

      const allResults = await Promise.all(
        usernamesToFetch.map(u => fetchFilteredGames(u, filters, 1, 10000))
      )
      const merged = allResults.flat().sort((a: any, b: any) => b.gd_end_time - a.gd_end_time)

      if (!cancelled) {
        setAllGames(merged)
        onGamesChange?.(merged)
        setLoading(false)
      }
    }

    fetchAll().catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [playerFilter, playerUsernames, filters])

  const displayGames = useMemo(() => {
    const offset = (currentPage - 1) * itemsPerPage
    return allGames.slice(offset, offset + itemsPerPage)
  }, [allGames, currentPage, itemsPerPage])


  const totalCount = allGames.length
  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1

  function handleSelectGame(row: any) {
    const rowUsername = row.gd_player_username
    const game: ChessComGame = {
      url: row.gd_game_url,
      pgn: '',
      time_control: row.gd_time_control,
      time_class: row.gd_time_class,
      end_time: row.gd_end_time,
      rated: row.gd_is_rated,
      rules: 'chess',
      white: {
        username: row.gd_white_username,
        rating: row.gd_white_rating,
        result: row.gd_player_color === 'white'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      },
      black: {
        username: row.gd_black_username,
        rating: row.gd_black_rating,
        result: row.gd_player_color === 'black'
          ? row.gd_player_result
          : (row.gd_player_result === 'win' ? 'loss' : row.gd_player_result === 'loss' ? 'win' : 'draw')
      }
    }
    ;(game as any)._gameId = row.gd_grid
    ;(game as any)._openingName = row.gd_opening_name
    ;(game as any)._ecoCode = row.gd_eco_code
    onSelectGame(game, rowUsername)
  }

  function handleReset() {
    setFilters({})
    setCurrentPage(1)
    if (hasMultiple) {
      setPlayerFilter(BOTH)
      onPlayerFilterChange?.(BOTH)
    }
  }

  return (
    <MyBox title='Games'>
      <div className='overflow-x-auto'>
        <table className='w-full text-left text-xs'>
          <thead>
            <tr className='border-b border-gray-200 text-gray-500'>
              <th className='pb-1 pr-2 text-gray-400'>#</th>
              <th className='pb-1 pr-2'>Date</th>
              <th className='pb-1 pr-2'>Player</th>
              <th className='pb-1 pr-2 text-center'>Color</th>
              <th className='pb-1 pr-2 text-center'>Time</th>
              <th className='pb-1 pr-2'>Opponent</th>
              <th className='pb-1 pr-2 text-center'>Opp. Rating</th>
              <th className='pb-1 pr-2 text-center'>Result</th>
              <th className='pb-1 pr-2'>Opening</th>
              <th className='pb-1 pr-2'>ECO</th>
              <th className='pb-1'></th>
            </tr>
            <tr className='border-b border-gray-300 bg-gray-50'>
              <td className='py-1 pr-2' />
              <td className='py-1 pr-2'>
                <div className='flex flex-col gap-0.5'>
                  <MyInput
                    type='date'
                    value={filters.dateFrom ?? ''}
                    onChange={e => updateFilter('dateFrom', e.target.value)}
                    overrideClass='w-28 text-xxs'
                    placeholder='From'
                    min={minDate}
                    max={TODAY}
                  />
                  <MyInput
                    type='date'
                    value={filters.dateTo ?? ''}
                    onChange={e => updateFilter('dateTo', e.target.value)}
                    overrideClass='w-28 text-xxs'
                    placeholder='To'
                    min={minDate}
                    max={TODAY}
                  />
                </div>
              </td>
              <td className='py-1 pr-2'>
                {hasMultiple && (
                  <div className='w-24'>
                    <MySelect
                      options={playerFilterOptions}
                      value={playerFilter}
                      onChange={e => { setPlayerFilter(e.target.value); setCurrentPage(1); onPlayerFilterChange?.(e.target.value) }}
                    />
                  </div>
                )}
              </td>
              <td className='py-1 pr-2 text-center'>
                <div className='w-16 mx-auto'>
                  <MySelect
                    options={['', 'white', 'black']}
                    value={filters.color ?? ''}
                    onChange={e => updateFilter('color', e.target.value)}
                  />
                </div>
              </td>
              <td className='py-1 pr-2 text-center'>
                <div className='w-16 mx-auto'>
                  <MySelect
                    options={['', 'blitz', 'rapid']}
                    value={filters.timeClass ?? ''}
                    onChange={e => updateFilter('timeClass', e.target.value)}
                  />
                </div>
              </td>
              <td className='py-1 pr-2'>
                <MyInput
                  value={filters.opponent ?? ''}
                  onChange={e => updateFilter('opponent', e.target.value)}
                  placeholder='Filter...'
                  overrideClass='w-24'
                />
              </td>
              <td className='py-1 pr-2'>
                {(() => {
                  const rMin = filters.opponentRatingMin ?? ''
                  const rMax = filters.opponentRatingMax ?? ''
                  const overlap = rMin !== '' && rMax !== '' && Number(rMin) > Number(rMax)
                  const cls = `w-16 rounded border px-1 py-0.5 text-xs text-gray-700 ${overlap ? 'border-red-400' : 'border-gray-300'}`
                  return (
                    <div className='flex flex-col gap-0.5 items-center'>
                      <div className='flex items-center gap-1'>
                        <span className='text-xs text-gray-500 w-7 text-right'>Min</span>
                        <input
                          type='text'
                          inputMode='numeric'
                          value={rMin}
                          onChange={e => updateFilter('opponentRatingMin', e.target.value.replace(/\D/g, ''))}
                          placeholder='Min'
                          className={cls}
                        />
                      </div>
                      <div className='flex items-center gap-1'>
                        <span className='text-xs text-gray-500 w-7 text-right'>Max</span>
                        <input
                          type='text'
                          inputMode='numeric'
                          value={rMax}
                          onChange={e => updateFilter('opponentRatingMax', e.target.value.replace(/\D/g, ''))}
                          placeholder='Max'
                          className={cls}
                        />
                      </div>
                      {overlap && <span className='text-xs text-red-500 pl-8'>min &gt; max</span>}
                    </div>
                  )
                })()}
              </td>
              <td className='py-1 pr-2 text-center'>
                <div className='w-16 mx-auto'>
                  <MySelect
                    options={['', 'win', 'loss', 'draw']}
                    value={filters.result ?? ''}
                    onChange={e => updateFilter('result', e.target.value)}
                  />
                </div>
              </td>
              <td className='py-1 pr-2'>
                <MyInput
                  value={filters.opening ?? ''}
                  onChange={e => updateFilter('opening', e.target.value)}
                  placeholder='Filter...'
                  overrideClass='w-80'
                />
              </td>
              <td className='py-1 pr-2'>
                <MyInput
                  value={filters.eco ?? ''}
                  onChange={e => updateFilter('eco', e.target.value)}
                  placeholder='e.g. B27'
                  overrideClass='w-16'
                />
              </td>
              <td className='py-1'>
                <MyButton onClick={handleReset} overrideClass='text-xxs px-1 h-5 bg-gray-400 hover:bg-gray-500'>
                  Reset
                </MyButton>
              </td>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className='py-4 text-center text-xs text-gray-500'>Loading...</td>
              </tr>
            )}
            {!loading && displayGames.length === 0 && (
              <tr>
                <td colSpan={11} className='py-4 text-center text-xs text-gray-500'>
                  No games found. Try adjusting your filters or populate games first.
                </td>
              </tr>
            )}
            {!loading && displayGames.map((row, index) => {
              const date = new Date(row.gd_end_time * 1000)
              const dd = String(date.getDate()).padStart(2, '0')
              const mm = String(date.getMonth() + 1).padStart(2, '0')
              const yy = String(date.getFullYear()).slice(2)
              const hh = String(date.getHours()).padStart(2, '0')
              const min = String(date.getMinutes()).padStart(2, '0')
              const dateStr = `${dd}/${mm}/${yy} ${hh}:${min}`
              const gameNumber = (currentPage - 1) * itemsPerPage + index + 1

              return (
                <tr
                  key={row.gd_grid}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 ${row.gd_grid === lastAnalyzedGameId ? 'bg-yellow-50 outline outline-1 outline-yellow-300' : ''}`}
                  onClick={() => handleSelectGame(row)}
                >
                  <td className='py-1.5 pr-2 text-gray-400 tabular-nums'>{gameNumber}</td>
                  <td className='py-1.5 pr-2 whitespace-nowrap'>{dateStr}</td>
                  <td className='py-1.5 pr-2'>{row.gd_player_username}</td>
                  <td className='py-1.5 pr-2'>
                    <div className='flex justify-center'>
                      <span className={`inline-block h-3 w-3 rounded-full border border-gray-300 ${
                        row.gd_player_color === 'white' ? 'bg-white' : 'bg-gray-800'
                      }`} />
                    </div>
                  </td>
                  <td className='py-1.5 pr-2'><div className='flex justify-center text-gray-500'>{row.gd_time_class}</div></td>
                  <td className='py-1.5 pr-2'>{row.gd_opponent_username}</td>
                  <td className='py-1.5 pr-2'><div className='flex justify-center'>{row.gd_opponent_rating}</div></td>
                  <td className='py-1.5 pr-2'>
                    <div className={`flex justify-center ${RESULT_STYLES[row.gd_player_result]}`}>
                      {row.gd_player_result}
                    </div>
                  </td>
                  <td className='py-1.5 pr-2 max-w-40 truncate' title={row.gd_opening_name}>
                    {row.gd_opening_name || 'Unknown'}
                  </td>
                  <td className='py-1.5 pr-2 text-gray-400'>{row.gd_eco_code}</td>
                  <td className='py-1.5'>
                    <MyButton
                      onClick={(e) => { e.stopPropagation(); handleSelectGame(row) }}
                      overrideClass='text-xxs px-2 py-0.5 h-5'
                    >
                      Analyze
                    </MyButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className='mt-3 flex items-center justify-between'>
        <div className='w-24'>
          <MySelect
            label='Rows'
            options={['10', '15', '25', '50']}
            value={String(itemsPerPage)}
            onChange={e => { setItemsPerPage(parseInt(e.target.value, 10)); setCurrentPage(1) }}
          />
        </div>
        {totalPages > 1 && (
          <MyPagination
            totalPages={totalPages}
            statecurrentPage={currentPage}
            setStateCurrentPage={setCurrentPage}
          />
        )}
        <span className='text-xxs text-gray-400'>
          Page {currentPage} of {totalPages} ({totalCount.toLocaleString()} games)
        </span>
      </div>
    </MyBox>
  )
}
