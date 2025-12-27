// API route to fetch OSRS world data from BigQuery
// Uses service account credentials stored in environment variables
// Frontend polls every 15 minutes to limit BigQuery queries

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const worldId = searchParams.get('world')

    // Get service account credentials from environment
    let credentials

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      } catch (e) {
        return Response.json({ error: 'Invalid JSON in GOOGLE_SERVICE_ACCOUNT_JSON', worlds: [] }, { status: 500 })
      }
    } else {
      let privateKey = process.env.GOOGLE_PRIVATE_KEY || ''
      if (privateKey.includes('\\n')) {
        privateKey = privateKey.split('\\n').join('\n')
      }
      if (privateKey && !privateKey.includes('-----BEGIN')) {
        privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`
      }
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
      return Response.json({ error: 'Missing credentials', worlds: [] }, { status: 500 })
    }

    // Get access token for BigQuery
    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ error: `Token error: ${tokenResult.error}`, worlds: [] }, { status: 500 })
    }
    const token = tokenResult.token

    const projectId = credentials.project_id || 'aggrgtr-482420'
    const bigqueryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`

    // If world ID specified, return history for that world
    if (worldId) {
      const historyQuery = `
        SELECT timestamp, players
        FROM \`${projectId}.rs_population.world_data\`
        WHERE world_id = ${parseInt(worldId)}
        ORDER BY timestamp ASC
      `

      const historyResponse = await fetch(bigqueryUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: historyQuery,
          useLegacySql: false,
          timeoutMs: 30000,
        })
      })

      if (!historyResponse.ok) {
        const error = await historyResponse.text()
        return Response.json({ error: `BigQuery API: ${error.substring(0, 200)}`, history: [] }, { status: 500 })
      }

      const historyJson = await historyResponse.json()
      const history = (historyJson.rows || []).map(row => ({
        timestamp: row.f[0].v,
        players: parseInt(row.f[1].v) || 0
      }))

      return Response.json({ worldId: parseInt(worldId), history })
    }

    // Query BigQuery for latest snapshot
    const query = `
      SELECT timestamp, world_id, world_name, players, location, world_type, activity, game
      FROM \`${projectId}.rs_population.world_data\`
      WHERE timestamp = (SELECT MAX(timestamp) FROM \`${projectId}.rs_population.world_data\`)
      ORDER BY players DESC
    `

    const response = await fetch(bigqueryUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        timeoutMs: 30000,
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('BigQuery API error:', error)
      return Response.json({ error: `BigQuery API: ${error.substring(0, 200)}`, worlds: [] }, { status: 500 })
    }

    const json = await response.json()

    if (json.errors) {
      return Response.json({ error: json.errors[0]?.message || 'BigQuery error', worlds: [] }, { status: 500 })
    }

    // Parse BigQuery response
    const rows = json.rows || []
    const worlds = rows.map(row => ({
      timestamp: row.f[0].v,
      world_id: parseInt(row.f[1].v) || 0,
      world_name: row.f[2].v || '',
      players: parseInt(row.f[3].v) || 0,
      location: row.f[4].v || '',
      world_type: row.f[5].v || '',
      activity: row.f[6].v || '-',
      game: row.f[7].v || 'osrs'
    })).filter(w => w.world_id > 0)

    // Calculate summary stats
    const totalPlayers = worlds.reduce((sum, w) => sum + w.players, 0)
    const byRegion = {}
    const byType = {}
    const byActivity = {}

    for (const w of worlds) {
      // By region
      if (!byRegion[w.location]) byRegion[w.location] = { count: 0, players: 0 }
      byRegion[w.location].count++
      byRegion[w.location].players += w.players

      // By type
      if (!byType[w.world_type]) byType[w.world_type] = { count: 0, players: 0 }
      byType[w.world_type].count++
      byType[w.world_type].players += w.players

      // By activity
      const activity = w.activity && w.activity !== '-' ? w.activity : 'General'
      if (!byActivity[activity]) byActivity[activity] = { count: 0, players: 0 }
      byActivity[activity].count++
      byActivity[activity].players += w.players
    }

    return Response.json({
      worlds,
      count: worlds.length,
      totalPlayers,
      timestamp: worlds[0]?.timestamp,
      summary: {
        byRegion,
        byType,
        byActivity
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return Response.json({ error: error.message, worlds: [] }, { status: 500 })
  }
}

async function getAccessToken(credentials) {
  try {
    const jwt = await createJWT(credentials)

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    const data = await response.json()
    if (data.error) {
      return { error: `${data.error}: ${data.error_description}` }
    }
    return { token: data.access_token }
  } catch (err) {
    return { error: err.message }
  }
}

async function createJWT(credentials) {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

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
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(data)
  const signature = sign.sign(privateKey, 'base64')
  return signature
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
