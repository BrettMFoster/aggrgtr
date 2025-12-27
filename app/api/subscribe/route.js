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

    // Check if email already exists
    const existingEmails = await getExistingEmails(token, SPREADSHEET_ID)
    if (existingEmails.includes(email.toLowerCase())) {
      return Response.json({ error: 'Email already subscribed' }, { status: 409 })
    }

    // Append new email
    const timestamp = new Date().toISOString()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Subscriptions!A:B:append?valueInputOption=USER_ENTERED`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[email.toLowerCase(), timestamp]]
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Subscriptions!A:B`
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

    // Delete the row (rowIndex + 1 for 1-based sheets indexing)
    const deleteUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`
    const deleteResponse = await fetch(deleteUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId: await getSheetId(token, SPREADSHEET_ID, 'Subscriptions'),
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1
            }
          }
        }]
      })
    })

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text()
      console.error('Delete error:', error)
      return Response.json({ error: 'Failed to unsubscribe' }, { status: 500 })
    }

    return Response.json({ success: true, message: 'Unsubscribed successfully' })

  } catch (error) {
    console.error('Unsubscribe error:', error)
    return Response.json({ error: error.message }, { status: 500 })
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

async function getSheetId(token, spreadsheetId, sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!response.ok) return 0

  const data = await response.json()
  const sheet = data.sheets?.find(s => s.properties?.title === sheetName)
  return sheet?.properties?.sheetId || 0
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
