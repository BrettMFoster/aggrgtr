// API route to manage email subscriptions via Google Sheets
// POST: Add email to Subscriptions sheet
// DELETE: Remove email from Subscriptions sheet

export async function POST(request) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Invalid email' }, { status: 400 })
    }

    const credentials = getCredentials()
    if (!credentials) {
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ error: 'Auth error' }, { status: 500 })
    }

    const SPREADSHEET_ID = '1leax3zpwjGRtYI9-OS80LLHAYMPWI4aXII3FnJHKQkw'
    const token = tokenResult.token

    // Ensure Subscriptions sheet exists
    await ensureSubscriptionsSheet(token, SPREADSHEET_ID)

    // Check if email already exists
    const existingEmails = await getExistingEmails(token, SPREADSHEET_ID)
    if (existingEmails.includes(email.toLowerCase())) {
      return Response.json({ error: 'Email already subscribed' }, { status: 409 })
    }

    // Append new email (email, subscribed_at, unsubscribed_at)
    const timestamp = new Date().toISOString()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Subscriptions!A:C:append?valueInputOption=USER_ENTERED`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[email.toLowerCase(), timestamp, '']]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Sheets API error:', error)
      return Response.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return Response.json({ success: true, message: 'Subscribed successfully' })

  } catch (error) {
    console.error('Subscribe error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes('@')) {
      return Response.json({ error: 'Invalid email' }, { status: 400 })
    }

    const credentials = getCredentials()
    if (!credentials) {
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ error: 'Auth error' }, { status: 500 })
    }

    const SPREADSHEET_ID = '1leax3zpwjGRtYI9-OS80LLHAYMPWI4aXII3FnJHKQkw'
    const token = tokenResult.token

    // Get all emails to find the row number
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Subscriptions!A:C`
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) {
      return Response.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
    }

    const data = await response.json()
    const rows = data.values || []

    // Find the row with this email (case-insensitive)
    const rowIndex = rows.findIndex(row => row[0]?.toLowerCase() === email.toLowerCase())

    if (rowIndex === -1) {
      return Response.json({ error: 'Email not found' }, { status: 404 })
    }

    // Check if already unsubscribed
    if (rows[rowIndex][2]) {
      return Response.json({ error: 'Already unsubscribed' }, { status: 409 })
    }

    // Update column C with unsubscribe timestamp (rowIndex + 1 for 1-based sheets indexing)
    const timestamp = new Date().toISOString()
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Subscriptions!C${rowIndex + 1}?valueInputOption=USER_ENTERED`
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[timestamp]]
      })
    })

    if (!updateResponse.ok) {
      const error = await updateResponse.text()
      console.error('Unsubscribe error:', error)
      return Response.json({ error: 'Failed to unsubscribe' }, { status: 500 })
    }

    return Response.json({ success: true, message: 'Unsubscribed successfully' })

  } catch (error) {
    console.error('Unsubscribe error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}

async function ensureSubscriptionsSheet(token, spreadsheetId) {
  // Check if Subscriptions sheet exists
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) return

  const data = await response.json()
  const hasSubscriptions = data.sheets?.some(s => s.properties?.title === 'Subscriptions')

  if (!hasSubscriptions) {
    // Create Subscriptions sheet with headers
    const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`
    await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title: 'Subscriptions'
            }
          }
        }]
      })
    })

    // Add headers
    const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Subscriptions!A1:C1?valueInputOption=USER_ENTERED`
    await fetch(headerUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [['email', 'subscribed_at', 'unsubscribed_at']]
      })
    })
  }
}

async function getExistingEmails(token, spreadsheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Subscriptions!A:A`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) return []

  const data = await response.json()
  return (data.values || []).map(row => row[0]?.toLowerCase()).filter(Boolean)
}

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

  if (!privateKey || !process.env.GOOGLE_CLIENT_EMAIL) {
    return null
  }

  return {
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
    scope: 'https://www.googleapis.com/auth/spreadsheets',
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
