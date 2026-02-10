// Steam concurrent player counts for RS games
// No API key needed for GetNumberOfCurrentPlayers

const STEAM_APPS = {
  osrs: 1343370,
  rs3: 1343400,
  dragonwilds: 1374490
}

let cache = null
let cacheTime = 0
const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

export async function GET() {
  const now = Date.now()
  if (cache && (now - cacheTime) < CACHE_TTL) {
    return Response.json(cache, {
      headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=60' }
    })
  }

  const results = {}

  await Promise.all(
    Object.entries(STEAM_APPS).map(async ([name, appId]) => {
      try {
        const res = await fetch(
          `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
          { next: { revalidate: 180 } }
        )
        const data = await res.json()
        results[name] = data.response?.player_count || 0
      } catch {
        results[name] = 0
      }
    })
  )

  results.total = results.osrs + results.rs3 + results.dragonwilds
  results.timestamp = new Date().toISOString()

  cache = results
  cacheTime = now

  return Response.json(results, {
    headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=60' }
  })
}
