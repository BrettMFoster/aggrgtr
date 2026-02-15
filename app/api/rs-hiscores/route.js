// API route to fetch RS3 hiscores data from BigQuery
// Serves snapshot, weekly, and monthly data for the hiscores dashboard

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') || 'live'

    // Get service account credentials from environment
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

    let query
    let cacheTTL

    if (view === 'live') {
      // Last 24h of raw snapshots
      query = `
        SELECT UNIX_SECONDS(scraped_at) as timestamp, total_accounts, last_page
        FROM \`${projectId}.rs_hiscores.snapshots\`
        WHERE scraped_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
        ORDER BY scraped_at ASC
      `
      cacheTTL = 180 // 3 minutes

    } else if (view === 'week') {
      // Last 7 days, daily max snapshot value
      query = `
        SELECT
          UNIX_SECONDS(TIMESTAMP_TRUNC(scraped_at, DAY)) as timestamp,
          MAX(total_accounts) as total_accounts,
          MAX(last_page) as last_page
        FROM \`${projectId}.rs_hiscores.snapshots\`
        WHERE scraped_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        GROUP BY 1
        ORDER BY timestamp ASC
      `
      cacheTTL = 900 // 15 minutes

    } else if (view === 'month') {
      // Last 30 days, daily max snapshot value
      query = `
        SELECT
          UNIX_SECONDS(TIMESTAMP_TRUNC(scraped_at, DAY)) as timestamp,
          MAX(total_accounts) as total_accounts,
          MAX(last_page) as last_page
        FROM \`${projectId}.rs_hiscores.snapshots\`
        WHERE scraped_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        GROUP BY 1
        ORDER BY timestamp ASC
      `
      cacheTTL = 900

    } else if (view === 'all_weekly') {
      // All weekly data (all time)
      query = `
        SELECT
          UNIX_SECONDS(TIMESTAMP(period_start)) as timestamp,
          total_accounts,
          last_page,
          period_label
        FROM \`${projectId}.rs_hiscores.weekly\`
        ORDER BY period_start ASC
      `
      cacheTTL = 3600 // 1 hour

    } else if (view === 'all_monthly') {
      // All monthly data (all time)
      query = `
        SELECT
          UNIX_SECONDS(TIMESTAMP(period_start)) as timestamp,
          total_accounts,
          last_page,
          period_label
        FROM \`${projectId}.rs_hiscores.monthly\`
        ORDER BY period_start ASC
      `
      cacheTTL = 3600

    } else {
      return Response.json({ error: `Unknown view: ${view}` }, { status: 400 })
    }

    // Also fetch summary stats for KPI cards
    const summaryQuery = `
      SELECT
        (SELECT total_accounts FROM \`${projectId}.rs_hiscores.snapshots\`
         ORDER BY scraped_at DESC LIMIT 1) as current_week_total,
        (SELECT total_accounts FROM \`${projectId}.rs_hiscores.weekly\`
         ORDER BY period_start DESC LIMIT 1) as last_week_total,
        (SELECT period_label FROM \`${projectId}.rs_hiscores.weekly\`
         ORDER BY period_start DESC LIMIT 1) as last_week_label,
        (SELECT total_accounts FROM \`${projectId}.rs_hiscores.monthly\`
         ORDER BY period_start DESC LIMIT 1) as current_month_total,
        (SELECT period_label FROM \`${projectId}.rs_hiscores.monthly\`
         ORDER BY period_start DESC LIMIT 1) as current_month_label,
        (SELECT total_accounts FROM \`${projectId}.rs_hiscores.monthly\`
         ORDER BY period_start DESC LIMIT 1 OFFSET 1) as last_month_total,
        (SELECT period_label FROM \`${projectId}.rs_hiscores.monthly\`
         ORDER BY period_start DESC LIMIT 1 OFFSET 1) as last_month_label,
        (SELECT MAX(total_accounts) FROM \`${projectId}.rs_hiscores.weekly\`) as peak_weekly,
        (SELECT period_label FROM \`${projectId}.rs_hiscores.weekly\`
         WHERE total_accounts = (SELECT MAX(total_accounts) FROM \`${projectId}.rs_hiscores.weekly\`)
         LIMIT 1) as peak_weekly_label,
        (SELECT MAX(total_accounts) FROM \`${projectId}.rs_hiscores.monthly\`) as peak_monthly,
        (SELECT period_label FROM \`${projectId}.rs_hiscores.monthly\`
         WHERE total_accounts = (SELECT MAX(total_accounts) FROM \`${projectId}.rs_hiscores.monthly\`)
         LIMIT 1) as peak_monthly_label,
        (SELECT CAST(ROUND(AVG(total_accounts)) AS INT64) FROM \`${projectId}.rs_hiscores.weekly\`
         WHERE period_start >= DATE_SUB(CURRENT_DATE(), INTERVAL 4 WEEK)) as avg_4week,
        (SELECT CAST(ROUND(AVG(total_accounts)) AS INT64) FROM \`${projectId}.rs_hiscores.monthly\`
         WHERE period_start >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)) as avg_12month
    `

    // Run both queries in parallel
    const [dataResponse, summaryResponse] = await Promise.all([
      fetch(bigqueryUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 30000 })
      }),
      fetch(bigqueryUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: summaryQuery, useLegacySql: false, timeoutMs: 30000 })
      })
    ])

    if (!dataResponse.ok) {
      const error = await dataResponse.text()
      return Response.json({ error: `BigQuery: ${error.substring(0, 200)}` }, { status: 500 })
    }

    const dataJson = await dataResponse.json()
    const rows = (dataJson.rows || []).map(row => ({
      timestamp: parseInt(row.f[0].v),
      total_accounts: parseInt(row.f[1].v) || 0,
      last_page: parseInt(row.f[2].v) || 0,
    }))

    // For weekly view: append current week from latest snapshot if not yet in weekly table
    if (view === 'all_weekly' && rows.length > 0) {
      const lastWeekTs = rows[rows.length - 1].timestamp
      const nowTs = Math.floor(Date.now() / 1000)
      // If the last weekly entry is more than 6 days old, current week is missing
      if (nowTs - lastWeekTs > 6 * 86400) {
        try {
          const snapQuery = `
            SELECT UNIX_SECONDS(scraped_at) as timestamp, total_accounts, last_page
            FROM \`${projectId}.rs_hiscores.snapshots\`
            ORDER BY scraped_at DESC LIMIT 1
          `
          const snapResponse = await fetch(bigqueryUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: snapQuery, useLegacySql: false, timeoutMs: 10000 })
          })
          if (snapResponse.ok) {
            const snapJson = await snapResponse.json()
            if (snapJson.rows?.[0]) {
              const snap = snapJson.rows[0].f
              // Use last weekly entry + 7 days as this week's period_start
              rows.push({
                timestamp: lastWeekTs + 7 * 86400,
                total_accounts: parseInt(snap[1].v) || 0,
                last_page: parseInt(snap[2].v) || 0,
              })
            }
          }
        } catch (e) {
          // Non-critical, just skip current week
        }
      }
    }

    // Parse summary
    let summary = {}
    if (summaryResponse.ok) {
      const summaryJson = await summaryResponse.json()
      if (summaryJson.rows && summaryJson.rows[0]) {
        const r = summaryJson.rows[0].f
        summary = {
          current_week_total: parseInt(r[0].v) || 0,
          last_week_total: parseInt(r[1].v) || 0,
          last_week_label: r[2].v || '',
          current_month_total: parseInt(r[3].v) || 0,
          current_month_label: r[4].v || '',
          last_month_total: parseInt(r[5].v) || 0,
          last_month_label: r[6].v || '',
          peak_weekly: parseInt(r[7].v) || 0,
          peak_weekly_label: r[8].v || '',
          peak_monthly: parseInt(r[9].v) || 0,
          peak_monthly_label: r[10].v || '',
          avg_4week: parseInt(r[11].v) || 0,
          avg_12month: parseInt(r[12].v) || 0,
        }
      }
    }

    return Response.json({ rows, summary, view }, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheTTL}, stale-while-revalidate=60`
      }
    })

  } catch (error) {
    console.error('Hiscores API error:', error)
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