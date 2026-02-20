// API route to fetch Jagex Player Support & Anti-Cheating stats from BigQuery
// Serves monthly data for the player-support dashboard

export async function GET() {
  try {
    let credentials

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      } catch (e) {
        return Response.json({ error: 'Invalid JSON in GOOGLE_SERVICE_ACCOUNT_JSON' }, { status: 500 })
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
      return Response.json({ error: 'Missing credentials' }, { status: 500 })
    }

    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ error: `Token error: ${tokenResult.error}` }, { status: 500 })
    }
    const token = tokenResult.token

    const projectId = credentials.project_id || 'aggrgtr-482420'
    const bigqueryUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`

    const query = `
      SELECT
        month,
        month_name,
        macro_bans_osrs,
        macro_bans_rs3,
        gp_removed_osrs,
        gp_removed_rs3,
        rwt_bans_osrs,
        rwt_bans_rs3,
        chat_spam_mutes,
        support_queries,
        support_center_views,
        report_action_msgs,
        avg_response_time_hrs,
        ticket_satisfaction_pct,
        macro_bans_ytd_osrs,
        macro_bans_ytd_rs3,
        gp_removed_ytd_osrs,
        gp_removed_ytd_rs3,
        rwt_bans_ytd_osrs,
        rwt_bans_ytd_rs3,
        source,
        source_url,
        is_estimated
      FROM \`${projectId}.rs_population.player_support_stats\`
      ORDER BY month ASC
    `

    const response = await fetch(bigqueryUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 30000 })
    })

    if (!response.ok) {
      const error = await response.text()
      return Response.json({ error: `BigQuery: ${error.substring(0, 200)}` }, { status: 500 })
    }

    const json = await response.json()
    const rows = (json.rows || []).map(row => {
      const f = row.f
      return {
        month: f[0].v,
        month_name: f[1].v,
        macro_bans_osrs: parseInt(f[2].v) || 0,
        macro_bans_rs3: parseInt(f[3].v) || 0,
        gp_removed_osrs: parseFloat(f[4].v) || 0,
        gp_removed_rs3: parseFloat(f[5].v) || 0,
        rwt_bans_osrs: parseInt(f[6].v) || 0,
        rwt_bans_rs3: parseInt(f[7].v) || 0,
        chat_spam_mutes: f[8].v ? parseInt(f[8].v) : null,
        support_queries: f[9].v ? parseInt(f[9].v) : null,
        support_center_views: f[10].v ? parseInt(f[10].v) : null,
        report_action_msgs: f[11].v ? parseInt(f[11].v) : null,
        avg_response_time_hrs: f[12].v ? parseFloat(f[12].v) : null,
        ticket_satisfaction_pct: f[13].v ? parseFloat(f[13].v) : null,
        macro_bans_ytd_osrs: parseInt(f[14].v) || 0,
        macro_bans_ytd_rs3: parseInt(f[15].v) || 0,
        gp_removed_ytd_osrs: parseFloat(f[16].v) || 0,
        gp_removed_ytd_rs3: parseFloat(f[17].v) || 0,
        rwt_bans_ytd_osrs: parseInt(f[18].v) || 0,
        rwt_bans_ytd_rs3: parseInt(f[19].v) || 0,
        source: f[20].v || '',
        source_url: f[21].v || '',
        is_estimated: f[22].v === 'true',
      }
    })

    const latest = rows.length > 0 ? rows[rows.length - 1] : null

    return Response.json({ rows, latest }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60'
      }
    })

  } catch (error) {
    console.error('Player support API error:', error)
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
    if (data.error) {
      return { error: `${data.error}: ${data.error_description}` }
    }
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
