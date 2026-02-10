// API route to fetch Steam player count history from BigQuery
// Data from steam_snapshots table (steamdb_backfill, steamcharts_hourly, steam_api_live)

let cache = {}
let cacheTime = {}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'week'
    const now = Date.now()
    const ttls = { live: 180000, week: 300000, month: 900000, year: 3600000, all: 3600000 }
    const ttl = ttls[view] || 300000

    if (cache[view] && (now - (cacheTime[view] || 0)) < ttl) {
      return Response.json(cache[view], {
        headers: { 'Cache-Control': `public, s-maxage=${Math.floor(ttl / 1000)}, stale-while-revalidate=60` }
      })
    }

    let credentials
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      } catch {
        return Response.json({ error: 'Invalid credentials JSON' }, { status: 500 })
      }
    } else {
      let privateKey = process.env.GOOGLE_PRIVATE_KEY || ''
      if (privateKey.includes('\\n')) privateKey = privateKey.split('\\n').join('\n')
      if (privateKey && !privateKey.includes('-----BEGIN')) privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`
      credentials = {
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      }
    }

    if (!credentials.private_key || !credentials.client_email) {
      return Response.json({ error: 'Missing credentials' }, { status: 500 })
    }

    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ error: `Token error: ${tokenResult.error}` }, { status: 500 })
    }

    const projectId = credentials.project_id || 'aggrgtr-482420'
    const bigqueryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`
    const table = `\`${projectId}.rs_population.steam_snapshots\``

    let query
    if (view === 'live') {
      query = `
        SELECT CAST(FLOOR(UNIX_SECONDS(timestamp) / 600) * 600 AS INT64) as ts,
          MAX(IF(game_name='osrs', player_count, NULL)) as osrs,
          MAX(IF(game_name='rs3', player_count, NULL)) as rs3,
          MAX(IF(game_name='dragonwilds', player_count, NULL)) as dragonwilds
        FROM ${table}
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        GROUP BY ts ORDER BY ts ASC
      `
    } else if (view === 'week') {
      query = `
        SELECT UNIX_SECONDS(TIMESTAMP_TRUNC(timestamp, HOUR)) as ts,
          MAX(IF(game_name='osrs', player_count, NULL)) as osrs,
          MAX(IF(game_name='rs3', player_count, NULL)) as rs3,
          MAX(IF(game_name='dragonwilds', player_count, NULL)) as dragonwilds
        FROM ${table}
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        GROUP BY ts ORDER BY ts ASC
      `
    } else if (view === 'month') {
      query = `
        SELECT UNIX_SECONDS(TIMESTAMP_TRUNC(timestamp, HOUR)) as ts,
          MAX(IF(game_name='osrs', player_count, NULL)) as osrs,
          MAX(IF(game_name='rs3', player_count, NULL)) as rs3,
          MAX(IF(game_name='dragonwilds', player_count, NULL)) as dragonwilds
        FROM ${table}
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        GROUP BY ts ORDER BY ts ASC
      `
    } else if (view === 'year') {
      query = `
        SELECT UNIX_SECONDS(TIMESTAMP_TRUNC(timestamp, DAY)) as ts,
          MAX(IF(game_name='osrs', player_count, NULL)) as osrs,
          MAX(IF(game_name='rs3', player_count, NULL)) as rs3,
          MAX(IF(game_name='dragonwilds', player_count, NULL)) as dragonwilds
        FROM ${table}
        WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
        GROUP BY ts ORDER BY ts ASC
      `
    } else if (view === 'all') {
      query = `
        SELECT UNIX_SECONDS(TIMESTAMP_TRUNC(timestamp, WEEK)) as ts,
          CAST(ROUND(AVG(IF(game_name='osrs', player_count, NULL))) AS INT64) as osrs,
          CAST(ROUND(AVG(IF(game_name='rs3', player_count, NULL))) AS INT64) as rs3,
          CAST(ROUND(AVG(IF(game_name='dragonwilds', player_count, NULL))) AS INT64) as dragonwilds
        FROM ${table}
        GROUP BY ts ORDER BY ts ASC
      `
    } else {
      return Response.json({ error: `Unknown view: ${view}` }, { status: 400 })
    }

    const response = await fetch(bigqueryUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 30000 })
    })

    if (!response.ok) {
      const error = await response.text()
      return Response.json({ error: `BigQuery: ${error.substring(0, 200)}` }, { status: 500 })
    }

    const json = await response.json()
    const rows = (json.rows || []).map(row => ({
      timestamp: parseInt(row.f[0].v),
      osrs: row.f[1].v ? Math.round(parseFloat(row.f[1].v)) : null,
      rs3: row.f[2].v ? Math.round(parseFloat(row.f[2].v)) : null,
      dragonwilds: row.f[3].v ? Math.round(parseFloat(row.f[3].v)) : null,
    }))

    const result = { rows, count: rows.length, view }
    cache[view] = result
    cacheTime[view] = now

    return Response.json(result, {
      headers: { 'Cache-Control': `public, s-maxage=${Math.floor(ttl / 1000)}, stale-while-revalidate=60` }
    })
  } catch (error) {
    console.error('Steam data API error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

async function getAccessToken(credentials) {
  try {
    const jwt = await createJWT(credentials)
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })
    const data = await response.json()
    if (data.error) return { error: `${data.error}: ${data.error_description}` }
    return { token: data.access_token }
  } catch (err) {
    return { error: err.message }
  }
}

async function createJWT(credentials) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signatureInput = `${encodedHeader}.${encodedPayload}`
  const signature = await sign(signatureInput, credentials.private_key)
  return `${signatureInput}.${signature}`
}

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sign(data, privateKey) {
  const crypto = await import('crypto')
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(data)
  const signature = signer.sign(privateKey, 'base64')
  return signature
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
