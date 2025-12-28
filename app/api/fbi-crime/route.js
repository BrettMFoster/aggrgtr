// API route to fetch FBI crime data from Google Sheets
// Data source: master_county_year table exported to Google Sheets

// In-memory cache for sheet data (5 minute TTL)
let cachedData = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes

// Only fetch the columns we need (much faster than A:GN with 170 columns)
const NEEDED_COLUMNS = [
  'state_abbr', 'state_name', 'county_name', 'year', 'population', 'incidents',
  'off_murder', 'off_rape', 'off_robbery', 'off_agg_assault', 'off_simple_assault',
  'off_burglary', 'off_larceny_pocket', 'off_larceny_purse', 'off_larceny_shoplifting',
  'off_larceny_building', 'off_larceny_coin_machine', 'off_larceny_vehicle',
  'off_larceny_vehicle_parts', 'off_larceny_other', 'off_motor_vehicle_theft',
  'off_drug_violations', 'off_weapon_violations',
  // Offender demographics
  'o_total', 'o_white', 'o_black', 'o_asian', 'o_native', 'o_pacific', 'o_race_other', 'o_race_unknown',
  'o_hispanic', 'o_not_hispanic', 'o_ethnicity_unknown'
]

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level') || 'state'
    const state = searchParams.get('state')
    const year = searchParams.get('year')

    // Check cache first
    const now = Date.now()
    if (cachedData && (now - cacheTime) < CACHE_TTL) {
      return processData(cachedData, level, state, year)
    }

    // Get credentials
    let credentials
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
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
      return Response.json({ error: 'Missing credentials', rows: [] }, { status: 500 })
    }

    // Get access token
    const tokenResult = await getAccessToken(credentials)
    if (tokenResult.error) {
      return Response.json({ error: `Token error: ${tokenResult.error}`, rows: [] }, { status: 500 })
    }

    const SPREADSHEET_ID = '1I8lgh3cxtTq-0aUnRiicvnPZ_yQdJ1Ail_4THL6V5oo'
    // Fetch columns A through CZ (includes offender demographics at columns 90-103)
    // This cuts down from 170 to ~104 columns
    const range = 'master_county_year!A:CZ'

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${tokenResult.token}` }
    })

    if (!response.ok) {
      const error = await response.text()
      return Response.json({ error: `Sheets API: ${error.substring(0, 200)}`, rows: [] }, { status: 500 })
    }

    const json = await response.json()
    const rows = json.values || []
    if (rows.length < 2) {
      return Response.json({ error: 'No data found', rows: [] }, { status: 404 })
    }

    // Parse headers and data - only keep columns we need
    const headers = rows[0]
    // Build column index map once (O(n) instead of O(n²))
    const colIndexMap = {}
    const stringCols = new Set(['state_abbr', 'state_name', 'county_name'])
    for (const col of NEEDED_COLUMNS) {
      const idx = headers.indexOf(col)
      if (idx >= 0) colIndexMap[col] = idx
    }

    const data = rows.slice(1).map(row => {
      const obj = {}
      for (const col in colIndexMap) {
        const val = row[colIndexMap[col]]
        obj[col] = stringCols.has(col) ? (val || '') : (parseInt(val) || 0)
      }
      return obj
    })

    // Update cache
    cachedData = data
    cacheTime = now

    return processData(data, level, state, year)
  } catch (error) {
    console.error('FBI Crime API error:', error)
    return Response.json({ error: error.message, rows: [] }, { status: 500 })
  }
}

function processData(data, level, state, year) {

    // Handle different levels
    if (level === 'metadata') {
      const years = [...new Set(data.map(d => d.year))].sort()
      const states = [...new Set(data.map(d => d.state_abbr))].sort()
      return Response.json({
        min_year: Math.min(...years),
        max_year: Math.max(...years),
        years,
        states,
        total_rows: data.length
      })
    }

    if (level === 'county') {
      // Return county-level data (optionally filtered)
      let filtered = data
      if (state) filtered = filtered.filter(d => d.state_abbr === state.toUpperCase())
      if (year) filtered = filtered.filter(d => d.year === parseInt(year))

      // Transform to dashboard format
      const transformed = filtered.map(d => ({
        state: d.state_abbr,
        state_name: d.state_name,
        county: d.county_name,
        year: d.year,
        pop: d.population,
        incidents: d.incidents,
        violent: (d.off_murder || 0) + (d.off_rape || 0) + (d.off_robbery || 0) + (d.off_agg_assault || 0),
        property: (d.off_burglary || 0) + (d.off_larceny_pocket || 0) + (d.off_larceny_purse || 0) +
                  (d.off_larceny_shoplifting || 0) + (d.off_larceny_building || 0) + (d.off_larceny_coin_machine || 0) +
                  (d.off_larceny_vehicle || 0) + (d.off_larceny_vehicle_parts || 0) + (d.off_larceny_other || 0) +
                  (d.off_motor_vehicle_theft || 0),
        homicide: d.off_murder || 0,
        assault: (d.off_agg_assault || 0) + (d.off_simple_assault || 0),
        robbery: d.off_robbery || 0,
        burglary: d.off_burglary || 0,
        theft: (d.off_larceny_pocket || 0) + (d.off_larceny_purse || 0) + (d.off_larceny_shoplifting || 0) +
               (d.off_larceny_building || 0) + (d.off_larceny_coin_machine || 0) + (d.off_larceny_vehicle || 0) +
               (d.off_larceny_vehicle_parts || 0) + (d.off_larceny_other || 0),
        drug: d.off_drug_violations || 0
      }))

      return Response.json({ level, rows: transformed, count: transformed.length })
    }

    if (level === 'state') {
      // Aggregate to state level
      const stateMap = {}
      for (const d of data) {
        const key = `${d.state_abbr}-${d.year}`
        if (!stateMap[key]) {
          stateMap[key] = {
            state: d.state_abbr,
            state_name: d.state_name,
            year: d.year,
            pop: 0,
            incidents: 0,
            counties: 0,
            off_murder: 0, off_rape: 0, off_robbery: 0, off_agg_assault: 0, off_simple_assault: 0,
            off_burglary: 0, off_larceny_pocket: 0, off_larceny_purse: 0, off_larceny_shoplifting: 0,
            off_larceny_building: 0, off_larceny_coin_machine: 0, off_larceny_vehicle: 0,
            off_larceny_vehicle_parts: 0, off_larceny_other: 0, off_motor_vehicle_theft: 0,
            off_drug_violations: 0, off_weapon_violations: 0,
            // Offender demographics
            o_total: 0, o_white: 0, o_black: 0, o_asian: 0, o_native: 0, o_pacific: 0, o_race_other: 0, o_race_unknown: 0,
            o_hispanic: 0, o_not_hispanic: 0, o_ethnicity_unknown: 0
          }
        }
        const s = stateMap[key]
        s.pop += d.population || 0
        s.incidents += d.incidents || 0
        s.counties += 1
        s.off_murder += d.off_murder || 0
        s.off_rape += d.off_rape || 0
        s.off_robbery += d.off_robbery || 0
        s.off_agg_assault += d.off_agg_assault || 0
        s.off_simple_assault += d.off_simple_assault || 0
        s.off_burglary += d.off_burglary || 0
        s.off_larceny_pocket += d.off_larceny_pocket || 0
        s.off_larceny_purse += d.off_larceny_purse || 0
        s.off_larceny_shoplifting += d.off_larceny_shoplifting || 0
        s.off_larceny_building += d.off_larceny_building || 0
        s.off_larceny_coin_machine += d.off_larceny_coin_machine || 0
        s.off_larceny_vehicle += d.off_larceny_vehicle || 0
        s.off_larceny_vehicle_parts += d.off_larceny_vehicle_parts || 0
        s.off_larceny_other += d.off_larceny_other || 0
        s.off_motor_vehicle_theft += d.off_motor_vehicle_theft || 0
        s.off_drug_violations += d.off_drug_violations || 0
        s.off_weapon_violations += d.off_weapon_violations || 0
        // Offender demographics
        s.o_total += d.o_total || 0
        s.o_white += d.o_white || 0
        s.o_black += d.o_black || 0
        s.o_asian += d.o_asian || 0
        s.o_native += d.o_native || 0
        s.o_pacific += d.o_pacific || 0
        s.o_race_other += d.o_race_other || 0
        s.o_race_unknown += d.o_race_unknown || 0
        s.o_hispanic += d.o_hispanic || 0
        s.o_not_hispanic += d.o_not_hispanic || 0
        s.o_ethnicity_unknown += d.o_ethnicity_unknown || 0
      }

      let stateData = Object.values(stateMap).map(s => ({
        state: s.state,
        state_name: s.state_name,
        year: s.year,
        pop: s.pop,
        incidents: s.incidents,
        counties: s.counties,
        // Offense types
        off_murder: s.off_murder,
        off_rape: s.off_rape,
        off_robbery: s.off_robbery,
        off_agg_assault: s.off_agg_assault,
        off_burglary: s.off_burglary,
        off_motor_vehicle_theft: s.off_motor_vehicle_theft,
        off_drug_violations: s.off_drug_violations,
        off_weapon_violations: s.off_weapon_violations,
        // Aggregates
        violent: s.off_murder + s.off_rape + s.off_robbery + s.off_agg_assault,
        property: s.off_burglary + s.off_larceny_pocket + s.off_larceny_purse + s.off_larceny_shoplifting +
                  s.off_larceny_building + s.off_larceny_coin_machine + s.off_larceny_vehicle +
                  s.off_larceny_vehicle_parts + s.off_larceny_other + s.off_motor_vehicle_theft,
        // Offender demographics
        o_total: s.o_total,
        o_white: s.o_white,
        o_black: s.o_black,
        o_asian: s.o_asian,
        o_native: s.o_native,
        o_pacific: s.o_pacific,
        o_race_other: s.o_race_other,
        o_race_unknown: s.o_race_unknown,
        o_hispanic: s.o_hispanic,
        o_not_hispanic: s.o_not_hispanic,
        o_ethnicity_unknown: s.o_ethnicity_unknown
      }))

      if (state) stateData = stateData.filter(d => d.state === state.toUpperCase())
      if (year) stateData = stateData.filter(d => d.year === parseInt(year))

      return Response.json({ level, rows: stateData, count: stateData.length })
    }

    if (level === 'national') {
      // Aggregate to national level by year
      const yearMap = {}
      for (const d of data) {
        if (!yearMap[d.year]) {
          yearMap[d.year] = {
            year: d.year,
            pop: 0,
            incidents: 0,
            states: new Set(),
            counties: 0,
            off_murder: 0, off_rape: 0, off_robbery: 0, off_agg_assault: 0, off_simple_assault: 0,
            off_burglary: 0, off_larceny_pocket: 0, off_larceny_purse: 0, off_larceny_shoplifting: 0,
            off_larceny_building: 0, off_larceny_coin_machine: 0, off_larceny_vehicle: 0,
            off_larceny_vehicle_parts: 0, off_larceny_other: 0, off_motor_vehicle_theft: 0,
            off_drug_violations: 0
          }
        }
        const y = yearMap[d.year]
        y.pop += d.population || 0
        y.incidents += d.incidents || 0
        y.states.add(d.state_abbr)
        y.counties += 1
        y.off_murder += d.off_murder || 0
        y.off_rape += d.off_rape || 0
        y.off_robbery += d.off_robbery || 0
        y.off_agg_assault += d.off_agg_assault || 0
        y.off_simple_assault += d.off_simple_assault || 0
        y.off_burglary += d.off_burglary || 0
        y.off_larceny_pocket += d.off_larceny_pocket || 0
        y.off_larceny_purse += d.off_larceny_purse || 0
        y.off_larceny_shoplifting += d.off_larceny_shoplifting || 0
        y.off_larceny_building += d.off_larceny_building || 0
        y.off_larceny_coin_machine += d.off_larceny_coin_machine || 0
        y.off_larceny_vehicle += d.off_larceny_vehicle || 0
        y.off_larceny_vehicle_parts += d.off_larceny_vehicle_parts || 0
        y.off_larceny_other += d.off_larceny_other || 0
        y.off_motor_vehicle_theft += d.off_motor_vehicle_theft || 0
        y.off_drug_violations += d.off_drug_violations || 0
      }

      const nationalData = Object.values(yearMap).map(y => ({
        year: y.year,
        pop: y.pop,
        incidents: y.incidents,
        states: y.states.size,
        counties: y.counties,
        agencies: y.counties,  // Approximation
        violent: y.off_murder + y.off_rape + y.off_robbery + y.off_agg_assault,
        property: y.off_burglary + y.off_larceny_pocket + y.off_larceny_purse + y.off_larceny_shoplifting +
                  y.off_larceny_building + y.off_larceny_coin_machine + y.off_larceny_vehicle +
                  y.off_larceny_vehicle_parts + y.off_larceny_other + y.off_motor_vehicle_theft,
        homicide: y.off_murder,
        assault: y.off_agg_assault + y.off_simple_assault,
        robbery: y.off_robbery,
        burglary: y.off_burglary,
        theft: y.off_larceny_pocket + y.off_larceny_purse + y.off_larceny_shoplifting +
               y.off_larceny_building + y.off_larceny_coin_machine + y.off_larceny_vehicle +
               y.off_larceny_vehicle_parts + y.off_larceny_other,
        drug: y.off_drug_violations,
        total: y.incidents
      })).sort((a, b) => a.year - b.year)

      return Response.json({ level, rows: nationalData, count: nationalData.length })
    }

    return Response.json({ error: `Invalid level: ${level}`, rows: [] }, { status: 400 })
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
  return signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
