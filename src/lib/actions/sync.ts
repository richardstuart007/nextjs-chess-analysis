'use server'

import { table_delete } from 'nextjs-shared/table_delete'
import { gameExists, insertRawGame, getLatestGameEndTime } from './games'
import { INCLUDED_TIME_CLASSES } from '../constants'

const GAMES_TABLE = 'tgr_gamesraw'

export async function initSync(
  playerUsername: string,
  syncType: 'full_replace' | 'refresh'
): Promise<{ archives: string[]; latestEndTime: number | null }> {
  const username = playerUsername.toLowerCase()

  if (syncType === 'full_replace') {
    await table_delete({
      table: GAMES_TABLE,
      whereColumnValuePairs: [{ column: 'gr_player_username', value: username }],
      caller: 'initSync_fullReplace'
    })
    const { sql } = await import('nextjs-shared/db')
    const db = await sql()
    await db.query({
      caller: 'initSync_resetSeq',
      query: "SELECT setval(pg_get_serial_sequence('tgr_gamesraw', 'gr_grid'), 1, false)",
      functionName: 'initSync'
    })
  }

  const latestEndTime = syncType === 'refresh'
    ? await getLatestGameEndTime(username)
    : null

  const archivesRes = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`)
  if (!archivesRes.ok) throw new Error(`Failed to fetch archives for ${username}`)
  const { archives } = await archivesRes.json() as { archives: string[] }

  return { archives, latestEndTime }
}

export async function syncArchive(params: {
  username: string
  archiveUrl: string
  syncType: 'full_replace' | 'refresh'
  latestEndTime: number | null
}): Promise<{ inserted: number; skipped: number; total: number }> {
  const { username, archiveUrl, syncType, latestEndTime } = params

  try {
    if (syncType === 'refresh' && latestEndTime) {
      const match = archiveUrl.match(/\/(\d{4})\/(\d{2})$/)
      if (match) {
        const archiveDate = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
        const latestDate = new Date(latestEndTime * 1000)
        if (archiveDate < new Date(latestDate.getFullYear(), latestDate.getMonth())) {
          return { inserted: 0, skipped: 0, total: 0 }
        }
      }
    }

    const monthRes = await fetch(archiveUrl)
    if (!monthRes.ok) return { inserted: 0, skipped: 0, total: 0 }

    const { games } = await monthRes.json() as { games: any[] }
    const standardGames = games
      .filter((g: any) => g.rules === 'chess' && g.pgn && INCLUDED_TIME_CLASSES.includes(g.time_class))
      .sort((a: any, b: any) => a.end_time - b.end_time)

    let inserted = 0
    let skipped = 0

    for (const game of standardGames) {
      const uuid = game.uuid || game.url
      if (!uuid) continue

      if (syncType === 'refresh' && latestEndTime && game.end_time <= latestEndTime) {
        skipped++
        continue
      }

      const exists = await gameExists(uuid)
      if (exists) {
        skipped++
        continue
      }

      await insertRawGame({
        player_username: username,
        chesscom_uuid: uuid,
        raw_data: game,
        pgn: game.pgn ?? null,
        end_time: game.end_time,
        time_class: game.time_class || ''
      })
      inserted++
    }

    return { inserted, skipped, total: games.length }
  } catch (error) {
    console.error(`Error syncing archive ${archiveUrl}:`, error)
    return { inserted: 0, skipped: 0, total: 0 }
  }
}
