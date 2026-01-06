// API route to fetch FBI crime data from Google Sheets
// Data source: master_county_year table exported to Google Sheets

// In-memory cache for sheet data (30 minute TTL since data changes rarely)
let cachedData = null
let cachedCityData = null
let cachedRaceData = null
let cachedCityRaceData = null
let cacheTime = 0
let cityCacheTime = 0
let raceCacheTime = 0
let cityRaceCacheTime = 0
const CACHE_TTL = 30 * 60 * 1000  // 30 minutes

// Google Sheets IDs
const COUNTY_SHEET_ID = '1I8lgh3cxtTq-0aUnRiicvnPZ_yQdJ1Ail_4THL6V5oo'
const CITY_SHEET_ID = '1F8S3Hmr4GoxUTwH5cMKxDZ8UPOG4-oeYDQ1iLwotpAI'
// Race-dimension sheets (for filtering by offender race)
const COUNTY_RACE_SHEET_ID = '19M80nlVmYR_RfIETxbEVkpLy1uL0kXFihMEa01nDYls'
const CITY_RACE_SHEET_ID = '1LfeCJh5gbDp5Y4GtB_j535J5QjlfCH9OVe1fnFmzC-k'

// Map non-standard state abbreviations from FBI data to USPS codes
const STATE_ABBR_FIXES = {
  'NB': 'NE',  // Nebraska: FBI uses NB, USPS is NE
}

// Only fetch the columns we need (much faster than A:GN with 170 columns)
const NEEDED_COLUMNS = [
  'state_abbr', 'state_name', 'county_name', 'year', 'population', 'incidents', 'incidents_cleared',
  // Homicide
  'off_murder', 'off_manslaughter', 'off_justifiable_homicide',
  // Sex crimes
  'off_rape', 'off_sodomy', 'off_sexual_assault', 'off_fondling',
  // Assault
  'off_agg_assault', 'off_simple_assault', 'off_intimidation',
  // Other violent
  'off_robbery', 'off_kidnapping',
  // Property
  'off_burglary', 'off_arson', 'off_motor_vehicle_theft',
  'off_larceny_pocket', 'off_larceny_purse', 'off_larceny_shoplifting',
  'off_larceny_building', 'off_larceny_coin_machine', 'off_larceny_vehicle',
  'off_larceny_vehicle_parts', 'off_larceny_other',
  // Other
  'off_drug_violations', 'off_weapon_violations',
  // Offender demographics
  'o_total', 'o_white', 'o_black', 'o_asian', 'o_native', 'o_pacific', 'o_race_other', 'o_race_unknown',
  'o_hispanic', 'o_not_hispanic', 'o_ethnicity_unknown'
]

// City data columns (same offense columns, but with agency_name instead of county_name as key)
const CITY_NEEDED_COLUMNS = [
  'state_abbr', 'state_name', 'agency_name', 'agency_type', 'county_name', 'year', 'population', 'incidents', 'incidents_cleared',
  // Homicide
  'off_murder', 'off_manslaughter', 'off_justifiable_homicide',
  // Sex crimes
  'off_rape', 'off_sodomy', 'off_sexual_assault', 'off_fondling',
  // Assault
  'off_agg_assault', 'off_simple_assault', 'off_intimidation',
  // Other violent
  'off_robbery', 'off_kidnapping',
  // Property
  'off_burglary', 'off_arson', 'off_motor_vehicle_theft',
  'off_larceny_pocket', 'off_larceny_purse', 'off_larceny_shoplifting',
  'off_larceny_building', 'off_larceny_coin_machine', 'off_larceny_vehicle',
  'off_larceny_vehicle_parts', 'off_larceny_other',
  // Other
  'off_drug_violations', 'off_weapon_violations',
  // Offender demographics
  'o_total', 'o_white', 'o_black', 'o_asian', 'o_native', 'o_pacific', 'o_race_other', 'o_race_unknown',
  'o_hispanic', 'o_not_hispanic', 'o_ethnicity_unknown'
]

// Race-filtered data columns (race is a dimension, so no o_* demographics needed)
const RACE_NEEDED_COLUMNS = [
  'state_abbr', 'state_name', 'county_name', 'year', 'race', 'population', 'incidents', 'incidents_cleared',
  // Same offense columns as regular data
  'off_murder', 'off_manslaughter', 'off_justifiable_homicide',
  'off_rape', 'off_sodomy', 'off_sexual_assault', 'off_fondling',
  'off_agg_assault', 'off_simple_assault', 'off_intimidation',
  'off_robbery', 'off_kidnapping',
  'off_burglary', 'off_arson', 'off_motor_vehicle_theft',
  'off_larceny_pocket', 'off_larceny_purse', 'off_larceny_shoplifting',
  'off_larceny_building', 'off_larceny_coin_machine', 'off_larceny_vehicle',
  'off_larceny_vehicle_parts', 'off_larceny_other',
  'off_drug_violations', 'off_weapon_violations'
]

const CITY_RACE_NEEDED_COLUMNS = [
  'state_abbr', 'state_name', 'agency_name', 'agency_type', 'county_name', 'year', 'race', 'population', 'incidents', 'incidents_cleared',
  'off_murder', 'off_manslaughter', 'off_justifiable_homicide',
  'off_rape', 'off_sodomy', 'off_sexual_assault', 'off_fondling',
  'off_agg_assault', 'off_simple_assault', 'off_intimidation',
  'off_robbery', 'off_kidnapping',
  'off_burglary', 'off_arson', 'off_motor_vehicle_theft',
  'off_larceny_pocket', 'off_larceny_purse', 'off_larceny_shoplifting',
  'off_larceny_building', 'off_larceny_coin_machine', 'off_larceny_vehicle',
  'off_larceny_vehicle_parts', 'off_larceny_other',
  'off_drug_violations', 'off_weapon_violations'
]

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level') || 'state'
    const state = searchParams.get('state')
    const year = searchParams.get('year')
    const race = searchParams.get('race') // comma-separated race values: white,black,asian,native,pacific,other,unknown
    const now = Date.now()

    // Determine if we need race-filtered data
    const needsRaceFilter = race && race.length > 0
    const selectedRaces = needsRaceFilter ? race.toLowerCase().split(',').map(r => r.trim()) : []

    // City data uses a different sheet
    if (level === 'city') {
      // Check city cache first (use race cache if race filter active)
      if (needsRaceFilter) {
        if (cachedCityRaceData && (now - cityRaceCacheTime) < CACHE_TTL) {
          return processCityRaceData(cachedCityRaceData, state, year, selectedRaces)
        }
      } else if (cachedCityData && (now - cityCacheTime) < CACHE_TTL) {
        return processCityData(cachedCityData, state, year)
      }
    } else {
      // Check county cache first (use race cache if race filter active)
      if (needsRaceFilter) {
        if (cachedRaceData && (now - raceCacheTime) < CACHE_TTL) {
          return processRaceData(cachedRaceData, level, state, year, selectedRaces)
        }
      } else if (cachedData && (now - cacheTime) < CACHE_TTL) {
        return processData(cachedData, level, state, year)
      }
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

    // Determine which sheet to fetch based on level and race filter
    const isCity = level === 'city'
    let sheetId, sheetName, neededCols, stringColNames

    if (needsRaceFilter) {
      // Use race-dimension sheets
      sheetId = isCity ? CITY_RACE_SHEET_ID : COUNTY_RACE_SHEET_ID
      sheetName = isCity ? 'master_city_year_race' : 'master_county_year_race'
      neededCols = isCity ? CITY_RACE_NEEDED_COLUMNS : RACE_NEEDED_COLUMNS
      stringColNames = isCity
        ? ['state_abbr', 'state_name', 'agency_name', 'agency_type', 'county_name', 'race']
        : ['state_abbr', 'state_name', 'county_name', 'race']
    } else {
      // Use regular sheets
      sheetId = isCity ? CITY_SHEET_ID : COUNTY_SHEET_ID
      sheetName = isCity ? 'master_city_year' : 'master_county_year'
      neededCols = isCity ? CITY_NEEDED_COLUMNS : NEEDED_COLUMNS
      stringColNames = isCity
        ? ['state_abbr', 'state_name', 'agency_name', 'agency_type', 'county_name']
        : ['state_abbr', 'state_name', 'county_name']
    }

    const range = `${sheetName}!A:BZ`
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
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
    const colIndexMap = {}
    const stringCols = new Set(stringColNames)
    for (const col of neededCols) {
      const idx = headers.indexOf(col)
      if (idx >= 0) colIndexMap[col] = idx
    }

    const data = rows.slice(1).map(row => {
      const obj = {}
      for (const col in colIndexMap) {
        const val = row[colIndexMap[col]]
        obj[col] = stringCols.has(col) ? (val || '') : (parseInt(val) || 0)
      }
      // Fix non-standard state abbreviations (NB → NE for Nebraska)
      if (obj.state_abbr && STATE_ABBR_FIXES[obj.state_abbr]) {
        obj.state_abbr = STATE_ABBR_FIXES[obj.state_abbr]
      }
      return obj
    })

    // Update appropriate cache and process data
    if (needsRaceFilter) {
      if (isCity) {
        cachedCityRaceData = data
        cityRaceCacheTime = now
        return processCityRaceData(data, state, year, selectedRaces)
      } else {
        cachedRaceData = data
        raceCacheTime = now
        return processRaceData(data, level, state, year, selectedRaces)
      }
    } else {
      if (isCity) {
        cachedCityData = data
        cityCacheTime = now
        return processCityData(data, state, year)
      } else {
        cachedData = data
        cacheTime = now
        return processData(data, level, state, year)
      }
    }
  } catch (error) {
    console.error('FBI Crime API error:', error)
    return Response.json({ error: error.message, rows: [] }, { status: 500 })
  }
}

// Helper to create cached JSON response with proper Vercel edge caching
function cachedJson(data, cacheSeconds = 300) {
  return Response.json(data, {
    headers: {
      'Cache-Control': `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=60`,
      'CDN-Cache-Control': `public, s-maxage=${cacheSeconds}`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheSeconds}`
    }
  })
}

function processData(data, level, state, year) {

    // Handle different levels
    if (level === 'metadata') {
      const years = [...new Set(data.map(d => d.year))].sort()
      const states = [...new Set(data.map(d => d.state_abbr))].sort()
      return cachedJson({
        min_year: Math.min(...years),
        max_year: Math.max(...years),
        years,
        states,
        total_rows: data.length
      }, 3600) // Cache metadata for 1 hour
    }

    if (level === 'county') {
      // Return county-level data (optionally filtered)
      let filtered = data
      if (state) filtered = filtered.filter(d => d.state_abbr === state.toUpperCase())
      if (year) filtered = filtered.filter(d => d.year === parseInt(year))

      // Transform to dashboard format - keep compact by copying offense columns directly
      const transformed = filtered.map(d => {
        const row = {
          state: d.state_abbr,
          county: d.county_name,
          year: d.year,
          pop: d.population,
          incidents: d.incidents || 0,
          incidents_cleared: d.incidents_cleared || 0
        }
        // Copy all offense columns directly (they already start with off_)
        for (const key in d) {
          if (key.startsWith('off_')) {
            row[key] = d[key] || 0
          }
        }
        return row
      })

      return cachedJson({ level, rows: transformed, count: transformed.length }, 300)
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
            incidents_cleared: 0,
            counties: 0,
            // Homicide
            off_murder: 0, off_manslaughter: 0, off_justifiable_homicide: 0,
            // Sex crimes
            off_rape: 0, off_sodomy: 0, off_sexual_assault: 0, off_fondling: 0,
            // Assault
            off_agg_assault: 0, off_simple_assault: 0, off_intimidation: 0,
            // Other violent
            off_robbery: 0, off_kidnapping: 0,
            // Property
            off_burglary: 0, off_arson: 0, off_motor_vehicle_theft: 0,
            off_larceny_pocket: 0, off_larceny_purse: 0, off_larceny_shoplifting: 0,
            off_larceny_building: 0, off_larceny_coin_machine: 0, off_larceny_vehicle: 0,
            off_larceny_vehicle_parts: 0, off_larceny_other: 0,
            // Other
            off_drug_violations: 0, off_weapon_violations: 0,
            // Offender demographics
            o_total: 0, o_white: 0, o_black: 0, o_asian: 0, o_native: 0, o_pacific: 0, o_race_other: 0, o_race_unknown: 0,
            o_hispanic: 0, o_not_hispanic: 0, o_ethnicity_unknown: 0
          }
        }
        const s = stateMap[key]
        s.pop += d.population || 0
        s.incidents += d.incidents || 0
        s.incidents_cleared += d.incidents_cleared || 0
        s.counties += 1
        // Homicide
        s.off_murder += d.off_murder || 0
        s.off_manslaughter += d.off_manslaughter || 0
        s.off_justifiable_homicide += d.off_justifiable_homicide || 0
        // Sex crimes
        s.off_rape += d.off_rape || 0
        s.off_sodomy += d.off_sodomy || 0
        s.off_sexual_assault += d.off_sexual_assault || 0
        s.off_fondling += d.off_fondling || 0
        // Assault
        s.off_agg_assault += d.off_agg_assault || 0
        s.off_simple_assault += d.off_simple_assault || 0
        s.off_intimidation += d.off_intimidation || 0
        // Other violent
        s.off_robbery += d.off_robbery || 0
        s.off_kidnapping += d.off_kidnapping || 0
        // Property
        s.off_burglary += d.off_burglary || 0
        s.off_arson += d.off_arson || 0
        s.off_motor_vehicle_theft += d.off_motor_vehicle_theft || 0
        s.off_larceny_pocket += d.off_larceny_pocket || 0
        s.off_larceny_purse += d.off_larceny_purse || 0
        s.off_larceny_shoplifting += d.off_larceny_shoplifting || 0
        s.off_larceny_building += d.off_larceny_building || 0
        s.off_larceny_coin_machine += d.off_larceny_coin_machine || 0
        s.off_larceny_vehicle += d.off_larceny_vehicle || 0
        s.off_larceny_vehicle_parts += d.off_larceny_vehicle_parts || 0
        s.off_larceny_other += d.off_larceny_other || 0
        // Other
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
        incidents_cleared: s.incidents_cleared,
        counties: s.counties,
        // Homicide
        off_murder: s.off_murder,
        off_manslaughter: s.off_manslaughter,
        off_justifiable_homicide: s.off_justifiable_homicide,
        // Sex crimes
        off_rape: s.off_rape,
        off_sodomy: s.off_sodomy,
        off_sexual_assault: s.off_sexual_assault,
        off_fondling: s.off_fondling,
        // Assault
        off_agg_assault: s.off_agg_assault,
        off_simple_assault: s.off_simple_assault,
        off_intimidation: s.off_intimidation,
        // Other violent
        off_robbery: s.off_robbery,
        off_kidnapping: s.off_kidnapping,
        // Property
        off_burglary: s.off_burglary,
        off_arson: s.off_arson,
        off_motor_vehicle_theft: s.off_motor_vehicle_theft,
        off_larceny_pocket: s.off_larceny_pocket,
        off_larceny_purse: s.off_larceny_purse,
        off_larceny_shoplifting: s.off_larceny_shoplifting,
        off_larceny_building: s.off_larceny_building,
        off_larceny_coin_machine: s.off_larceny_coin_machine,
        off_larceny_vehicle: s.off_larceny_vehicle,
        off_larceny_vehicle_parts: s.off_larceny_vehicle_parts,
        off_larceny_other: s.off_larceny_other,
        // Other
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

      return cachedJson({ level, rows: stateData, count: stateData.length }, 300)
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

      return cachedJson({ level, rows: nationalData, count: nationalData.length }, 600)
    }

    return Response.json({ error: `Invalid level: ${level}`, rows: [] }, { status: 400 })
}

// Process city data (agencies/cities from master_city_year)
function processCityData(data, state, year) {
  let filtered = data

  if (state) filtered = filtered.filter(d => d.state_abbr === state.toUpperCase())
  if (year) filtered = filtered.filter(d => d.year === parseInt(year))

  // Transform to dashboard format
  const transformed = filtered.map(d => {
    const row = {
      state: d.state_abbr,
      city: d.agency_name,
      agency_type: d.agency_type,
      county: d.county_name,
      year: d.year,
      pop: d.population,
      incidents: d.incidents || 0,
      incidents_cleared: d.incidents_cleared || 0
    }
    // Copy all offense columns directly
    for (const key in d) {
      if (key.startsWith('off_')) {
        row[key] = d[key] || 0
      }
    }
    return row
  })

  return cachedJson({ level: 'city', rows: transformed, count: transformed.length }, 300)
}

// Process race-filtered data (county level with race dimension)
// Data is already broken down by race, so we filter by selected races and aggregate
function processRaceData(data, level, state, year, selectedRaces) {
  // Filter by selected races first (with null check for race field)
  let filtered = data.filter(d => d.race && selectedRaces.includes(d.race.toLowerCase()))

  if (level === 'metadata') {
    const years = [...new Set(data.map(d => d.year))].sort()
    const states = [...new Set(data.map(d => d.state_abbr))].sort()
    const races = [...new Set(data.map(d => d.race))].sort()
    return cachedJson({
      min_year: Math.min(...years),
      max_year: Math.max(...years),
      years,
      states,
      races,
      total_rows: data.length
    }, 3600)
  }

  if (level === 'county') {
    if (state) filtered = filtered.filter(d => d.state_abbr === state.toUpperCase())
    if (year) filtered = filtered.filter(d => d.year === parseInt(year))

    // Aggregate across selected races (sum up all selected race rows for each county/year)
    const countyMap = {}
    for (const d of filtered) {
      const key = `${d.state_abbr}-${d.county_name}-${d.year}`
      if (!countyMap[key]) {
        countyMap[key] = {
          state: d.state_abbr,
          county: d.county_name,
          year: d.year,
          pop: d.population || 0,
          incidents: 0,
          incidents_cleared: 0
        }
        // Initialize offense columns
        for (const k in d) {
          if (k.startsWith('off_')) countyMap[key][k] = 0
        }
      }
      const c = countyMap[key]
      c.incidents += d.incidents || 0
      c.incidents_cleared += d.incidents_cleared || 0
      for (const k in d) {
        if (k.startsWith('off_')) c[k] += d[k] || 0
      }
    }

    const transformed = Object.values(countyMap)
    return cachedJson({ level, rows: transformed, count: transformed.length, races: selectedRaces }, 300)
  }

  if (level === 'state') {
    if (state) filtered = filtered.filter(d => d.state_abbr === state.toUpperCase())
    if (year) filtered = filtered.filter(d => d.year === parseInt(year))

    // Aggregate across selected races to state level
    const stateMap = {}
    for (const d of filtered) {
      const key = `${d.state_abbr}-${d.year}`
      if (!stateMap[key]) {
        stateMap[key] = {
          state: d.state_abbr,
          state_name: d.state_name,
          year: d.year,
          pop: 0,
          incidents: 0,
          incidents_cleared: 0,
          counties: new Set()
        }
        // Initialize offense columns
        for (const k in d) {
          if (k.startsWith('off_')) stateMap[key][k] = 0
        }
      }
      const s = stateMap[key]
      // Only count population once per county (not per race)
      if (!s.counties.has(d.county_name)) {
        s.pop += d.population || 0
        s.counties.add(d.county_name)
      }
      s.incidents += d.incidents || 0
      s.incidents_cleared += d.incidents_cleared || 0
      for (const k in d) {
        if (k.startsWith('off_')) s[k] += d[k] || 0
      }
    }

    const stateData = Object.values(stateMap).map(s => {
      const result = {
        state: s.state,
        state_name: s.state_name,
        year: s.year,
        pop: s.pop,
        incidents: s.incidents,
        incidents_cleared: s.incidents_cleared,
        counties: s.counties.size
      }
      // Copy offense columns
      for (const k in s) {
        if (k.startsWith('off_')) result[k] = s[k]
      }
      // Add computed aggregates
      result.violent = (s.off_murder || 0) + (s.off_rape || 0) + (s.off_robbery || 0) + (s.off_agg_assault || 0)
      result.property = (s.off_burglary || 0) + (s.off_larceny_pocket || 0) + (s.off_larceny_purse || 0) +
                       (s.off_larceny_shoplifting || 0) + (s.off_larceny_building || 0) + (s.off_larceny_coin_machine || 0) +
                       (s.off_larceny_vehicle || 0) + (s.off_larceny_vehicle_parts || 0) + (s.off_larceny_other || 0) +
                       (s.off_motor_vehicle_theft || 0)
      return result
    })

    return cachedJson({ level, rows: stateData, count: stateData.length, races: selectedRaces }, 300)
  }

  if (level === 'national') {
    // Aggregate to national level by year
    const yearMap = {}
    for (const d of filtered) {
      if (!yearMap[d.year]) {
        yearMap[d.year] = {
          year: d.year,
          pop: 0,
          incidents: 0,
          states: new Set(),
          counties: new Set()
        }
        for (const k in d) {
          if (k.startsWith('off_')) yearMap[d.year][k] = 0
        }
      }
      const y = yearMap[d.year]
      // Only count population once per county
      const countyKey = `${d.state_abbr}-${d.county_name}`
      if (!y.counties.has(countyKey)) {
        y.pop += d.population || 0
        y.counties.add(countyKey)
      }
      y.incidents += d.incidents || 0
      y.states.add(d.state_abbr)
      for (const k in d) {
        if (k.startsWith('off_')) y[k] += d[k] || 0
      }
    }

    const nationalData = Object.values(yearMap).map(y => ({
      year: y.year,
      pop: y.pop,
      incidents: y.incidents,
      states: y.states.size,
      counties: y.counties.size,
      violent: (y.off_murder || 0) + (y.off_rape || 0) + (y.off_robbery || 0) + (y.off_agg_assault || 0),
      property: (y.off_burglary || 0) + (y.off_larceny_pocket || 0) + (y.off_larceny_purse || 0) +
                (y.off_larceny_shoplifting || 0) + (y.off_larceny_building || 0) + (y.off_larceny_coin_machine || 0) +
                (y.off_larceny_vehicle || 0) + (y.off_larceny_vehicle_parts || 0) + (y.off_larceny_other || 0) +
                (y.off_motor_vehicle_theft || 0),
      homicide: y.off_murder || 0,
      assault: (y.off_agg_assault || 0) + (y.off_simple_assault || 0),
      robbery: y.off_robbery || 0,
      burglary: y.off_burglary || 0,
      drug: y.off_drug_violations || 0,
      total: y.incidents
    })).sort((a, b) => a.year - b.year)

    return cachedJson({ level, rows: nationalData, count: nationalData.length, races: selectedRaces }, 600)
  }

  return Response.json({ error: `Invalid level: ${level}`, rows: [] }, { status: 400 })
}

// Process city race-filtered data
function processCityRaceData(data, state, year, selectedRaces) {
  // Filter by selected races (with null check for race field)
  let filtered = data.filter(d => d.race && selectedRaces.includes(d.race.toLowerCase()))

  if (state) filtered = filtered.filter(d => d.state_abbr === state.toUpperCase())
  if (year) filtered = filtered.filter(d => d.year === parseInt(year))

  // Aggregate across selected races (sum up all selected race rows for each city/year)
  const cityMap = {}
  for (const d of filtered) {
    const key = `${d.state_abbr}-${d.agency_name}-${d.year}`
    if (!cityMap[key]) {
      cityMap[key] = {
        state: d.state_abbr,
        city: d.agency_name,
        agency_type: d.agency_type,
        county: d.county_name,
        year: d.year,
        pop: d.population || 0,
        incidents: 0,
        incidents_cleared: 0
      }
      // Initialize offense columns
      for (const k in d) {
        if (k.startsWith('off_')) cityMap[key][k] = 0
      }
    }
    const c = cityMap[key]
    c.incidents += d.incidents || 0
    c.incidents_cleared += d.incidents_cleared || 0
    for (const k in d) {
      if (k.startsWith('off_')) c[k] += d[k] || 0
    }
  }

  const transformed = Object.values(cityMap)
  return cachedJson({ level: 'city', rows: transformed, count: transformed.length, races: selectedRaces }, 300)
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
