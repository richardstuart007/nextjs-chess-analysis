const BASE = 'https://api.chess.com/pub'

export interface ChessComPlayer {
  username: string
  avatar?: string
  name?: string
  joined: number
  last_online: number
  url: string
}

export interface ChessComRatings {
  [timeControl: string]: {
    last: { rating: number; date: number }
    best?: { rating: number; date: number }
  }
}

export interface ChessComGame {
  url: string
  pgn: string
  time_control: string
  time_class: string
  end_time: number
  rated: boolean
  rules: string
  white: {
    username: string
    rating: number
    result: string
  }
  black: {
    username: string
    rating: number
    result: string
  }
}

export async function fetchPlayer(username: string): Promise<ChessComPlayer> {
  const res = await fetch(`${BASE}/player/${username}`)
  if (!res.ok) throw new Error(`Player "${username}" not found on chess.com`)
  return res.json()
}

export async function fetchPlayerStats(username: string): Promise<ChessComRatings> {
  const res = await fetch(`${BASE}/player/${username}/stats`)
  if (!res.ok) throw new Error(`Could not fetch stats for "${username}"`)
  const data = await res.json()

  const ratings: ChessComRatings = {}
  for (const key of ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily']) {
    if (data[key]?.last) {
      const label = key.replace('chess_', '')
      ratings[label] = {
        last: data[key].last,
        best: data[key].best
      }
    }
  }
  return ratings
}

export async function fetchRecentGames(
  username: string,
  count: number = 10
): Promise<ChessComGame[]> {
  // Get list of monthly archives
  const archivesRes = await fetch(`${BASE}/player/${username}/games/archives`)
  if (!archivesRes.ok) throw new Error(`Could not fetch archives for "${username}"`)
  const { archives } = await archivesRes.json() as { archives: string[] }

  if (archives.length === 0) return []

  // Fetch most recent month(s) until we have enough games
  const games: ChessComGame[] = []
  for (let i = archives.length - 1; i >= 0 && games.length < count; i--) {
    const monthRes = await fetch(archives[i])
    if (!monthRes.ok) continue
    const { games: monthGames } = await monthRes.json() as { games: ChessComGame[] }

    // Filter to standard chess only (no variants)
    const standardGames = monthGames.filter(g => g.rules === 'chess' && g.pgn)
    games.unshift(...standardGames)
  }

  // Return the most recent `count` games
  return games.slice(-count)
}

export function getPlayerResult(
  game: ChessComGame,
  username: string
): { color: 'white' | 'black'; result: string; opponentRating: number } {
  const isWhite = game.white.username.toLowerCase() === username.toLowerCase()
  const playerSide = isWhite ? game.white : game.black
  const opponentSide = isWhite ? game.black : game.white

  let result: string
  if (playerSide.result === 'win') result = 'win'
  else if (opponentSide.result === 'win') result = 'loss'
  else result = 'draw'

  return {
    color: isWhite ? 'white' : 'black',
    result,
    opponentRating: opponentSide.rating
  }
}

export function extractOpeningFromPgn(pgn: string): { name: string; eco: string } {
  const ecoMatch = pgn.match(/\[ECO\s+"([^"]+)"\]/)
  const nameMatch = pgn.match(/\[Opening\s+"([^"]+)"\]/)
  return {
    eco: ecoMatch?.[1] ?? '',
    name: nameMatch?.[1] ?? 'Unknown'
  }
}
