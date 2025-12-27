// API route to proxy Google Sheets data (avoids CORS issues)
const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/1VmFRFnLJyAh5wD6DXIJPfX-bTxrg_ouzg4NJEzsBZUs/gviz/tq?tqx=out:json'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const sheet = searchParams.get('sheet') || 'Data'

    const response = await fetch(`${SHEETS_URL}&sheet=${sheet}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    })

    const text = await response.text()

    // Parse Google Sheets JSON response
    const jsonStr = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/)?.[1]
    if (!jsonStr) {
      return Response.json({ error: 'Failed to parse response', rows: [] }, { status: 500 })
    }

    const json = JSON.parse(jsonStr)
    const rows = json.table.rows

    // Parse rows into clean data
    const data = rows.map(row => {
      let timestamp
      const dateVal = row.c[0]?.v
      const dateFormatted = row.c[0]?.f

      if (typeof dateVal === 'string' && dateVal.startsWith('Date(')) {
        const parts = dateVal.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/)
        if (parts) {
          // Note: Month is 0-indexed in JS Date
          timestamp = new Date(
            parseInt(parts[1]),
            parseInt(parts[2]),
            parseInt(parts[3]),
            parseInt(parts[4]) || 0,
            parseInt(parts[5]) || 0,
            parseInt(parts[6]) || 0
          ).toISOString()
        }
      } else if (dateVal) {
        timestamp = new Date(dateVal).toISOString()
      } else if (dateFormatted) {
        timestamp = new Date(dateFormatted).toISOString()
      }

      return {
        timestamp,
        osrs: row.c[1]?.v || 0,
        rs3: row.c[2]?.v || 0,
        total: row.c[3]?.v || 0
      }
    }).filter(d => d.timestamp)

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
