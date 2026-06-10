import { getPlayers } from '@/src/lib/actions/players'
import HomeDashboard from '@/src/ui/HomeDashboard'

export default async function Home({ searchParams }: { searchParams: Promise<{ highlight?: string }> }) {
  const [players, params] = await Promise.all([getPlayers(), searchParams])
  const lastAnalyzedGameId = params.highlight ? parseInt(params.highlight, 10) : undefined
  return <HomeDashboard players={players} lastAnalyzedGameId={lastAnalyzedGameId} />
}
