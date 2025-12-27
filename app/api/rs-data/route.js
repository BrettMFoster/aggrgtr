// API route to fetch RS population data from Google Sheets
// Uses service account credentials stored in environment variables

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const sheet = searchParams.get('sheet') || 'Data'

    // Get service account credentials from environment
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || ''

    // Handle various newline formats from Vercel env vars
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.split('\\n').join('\n')
    }

    // Add PEM headers if missing (user may have pasted just the key body)
    if (privateKey && !privateKey.includes('-----BEGIN')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`
    }

    const credentials = {
      type: 'service_account',
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
    }

    // Debug: check if key is present
    if (!privateKey || privateKey.length < 100) {
      return Response.json({ error: 'Private key not configured correctly', rows: [] }, { status: 500 })
    }

    // Get access token
    const token = await getAccessToken(credentials)

    const SPREADSHEET_ID = '1VmFRFnLJyAh5wD6DXIJPfX-bTxrg_ouzg4NJEzsBZUs'
    const range = `${sheet}!A:D`

    // Fetch from Google Sheets API
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Sheets API error:', error)
      return Response.json({ error: `Sheets API: ${error.substring(0, 200)}`, rows: [] }, { status: 500 })
    }

    const json = await response.json()
    const rows = json.values || []

    // Skip header row and parse data
    const data = rows.slice(1).map(row => {
      const timestamp = row[0]
      const osrs = parseInt(row[1]) || 0
      const rs3 = parseInt(row[2]) || 0
      const total = parseInt(row[3]) || 0

      let isoTimestamp
      try {
        isoTimestamp = new Date(timestamp).toISOString()
      } catch {
        return null
      }

      return {
        timestamp: isoTimestamp,
        osrs,
        rs3,
        total
      }
    }).filter(d => d && d.timestamp)

    return Response.json({
      rows: data,
      count: data.length,
      sheet
    })

  } catch (error) {
    console.error('API error:', error)
    return Response.json({ error: error.message, rows: [] }, { status: 500 })
  }
}

async function getAccessToken(credentials) {
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
  return data.access_token
}

async function createJWT(credentials) {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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
