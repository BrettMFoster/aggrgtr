// API route: Scrape RS3 hiscores current week count and store snapshot to BigQuery
// Called every 3 minutes by Vercel Cron

const PROJECT_ID = 'aggrgtr-482420'
const DATASET_ID = 'rs_hiscores'
const TABLE_ID = 'snapshots'

const HISCORES_URL = 'https://secure.runescape.com/m=hiscore/ranking?category_type=0&table=0&time_filter=1&page=1'

export async function GET(request) {
  const now = new Date().toISOString()

  try {
    // 1. Fetch the hiscores page
    const resp = await fetch(HISCORES_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    })

    if (!resp.ok) {
      return Response.json({
        status: 'error',
        message: `Hiscores returned ${resp.status}`,
        timestamp: now,
      }, { status: 502 })
    }

    const html = await resp.text()

    // 2. Parse last page number from pagination links
    const pageMatches = html.match(/page=(\d+)/g)
    if (!pageMatches) {
      return Response.json({
        status: 'error',
        message: 'No pagination found in hiscores page',
        timestamp: now,
        htmlPreview: html.substring(0, 300),
      }, { status: 502 })
    }

    const pageNumbers = pageMatches.map(m => parseInt(m.replace('page=', '')))
    const lastPage = Math.max(...pageNumbers)
    const totalAccounts = lastPage * 25

    // 3. Get BigQuery access token
    const credentials = getCredentials()
    if (!credentials) {
      return Response.json({ status: 'error', message: 'Missing credentials' }, { status: 500 })
    }

    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ status: 'error', message: `Auth error: ${tokenResult.error}` }, { status: 500 })
    }

    // 4. Insert row into BigQuery
    const insertUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}/datasets/${DATASET_ID}/tables/${TABLE_ID}/insertAll`

    const insertResp = await fetch(insertUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rows: [{
          json: {
            scraped_at: now,
            total_accounts: totalAccounts,
            last_page: lastPage,
          }
        }]
      })
    })

    const insertResult = await insertResp.json()

    if (insertResult.insertErrors && insertResult.insertErrors.length > 0) {
      return Response.json({
        status: 'error',
        message: 'BigQuery insert error',
        errors: insertResult.insertErrors,
        timestamp: now,
      }, { status: 500 })
    }

    return Response.json({
      status: 'success',
      timestamp: now,
      total_accounts: totalAccounts,
      last_page: lastPage,
    })

  } catch (error) {
    console.error('Hiscores snapshot error:', error)
    return Response.json({
      status: 'error',
      message: error.message,
      timestamp: now,
    }, { status: 500 })
  }
}

// --- Auth helpers (same pattern as rs-data route) ---

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    } catch {
      return null
    }
  }

  let privateKey = process.env.GOOGLE_PRIVATE_KEY || ''
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.split('\\n').join('\n')
  }
  if (privateKey && !privateKey.includes('-----BEGIN')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`
  }

  if (!privateKey || !process.env.GOOGLE_CLIENT_EMAIL) return null

  return {
    type: 'service_account',
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key: privateKey,
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
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
    scope: 'https://www.googleapis.com/auth/bigquery.insertdata',
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
