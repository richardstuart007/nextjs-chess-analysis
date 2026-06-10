'use server'

import { getPlayers, updatePlayerRating } from './players'
import { initSync, syncArchive } from './sync'
import { deconstructGames } from './deconstruct'

export async function runCronSync(): Promise<{ players: { username: string; inserted: number; deconstructed: number }[]; totalInserted: number; totalDeconstructed: number }> {
  const players = await getPlayers()
  const summary: { username: string; inserted: number; deconstructed: number }[] = []

  for (const player of players) {
    const username = player.username
    let totalInserted = 0

    try {
      const { archives, latestEndTime } = await initSync(username, 'refresh')

      for (const archiveUrl of archives) {
        const result = await syncArchive({ username, archiveUrl, syncType: 'refresh', latestEndTime })
        totalInserted += result.inserted
      }

      const { processed } = await deconstructGames(username, 0)
      await updatePlayerRating(username)
      summary.push({ username, inserted: totalInserted, deconstructed: processed })
    } catch (err) {
      console.error(`Cron sync failed for ${username}:`, err)
      summary.push({ username, inserted: totalInserted, deconstructed: 0 })
    }
  }

  const totalInserted = summary.reduce((s, p) => s + p.inserted, 0)
  const totalDeconstructed = summary.reduce((s, p) => s + p.deconstructed, 0)

  return { players: summary, totalInserted, totalDeconstructed }
}
