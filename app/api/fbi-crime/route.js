// API route to serve FBI crime statistics from static JSON files
// Data is pre-aggregated and only updates once per year when FBI releases new data

import { promises as fs } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'public', 'data', 'fbi')

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const level = searchParams.get('level') || 'national'  // national, state, county, agency
    const state = searchParams.get('state')  // For agency-level data
    const year = searchParams.get('year')    // Filter by year

    let data
    let filePath

    switch (level) {
      case 'national':
        filePath = path.join(DATA_DIR, 'national.json')
        break
      case 'state':
        filePath = path.join(DATA_DIR, 'state.json')
        break
      case 'county':
        filePath = path.join(DATA_DIR, 'county.json')
        break
      case 'agency':
        if (!state) {
          return Response.json({
            error: 'State parameter required for agency-level data. Use ?level=agency&state=TX',
            rows: []
          }, { status: 400 })
        }
        filePath = path.join(DATA_DIR, 'agency', `${state.toUpperCase()}.json`)
        break
      case 'metadata':
        filePath = path.join(DATA_DIR, 'metadata.json')
        break
      default:
        return Response.json({
          error: `Invalid level: ${level}. Use national, state, county, agency, or metadata`,
          rows: []
        }, { status: 400 })
    }

    // Read the JSON file
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8')
      data = JSON.parse(fileContent)
    } catch (err) {
      if (err.code === 'ENOENT') {
        return Response.json({
          error: `Data not found for ${level}${state ? ` (state: ${state})` : ''}`,
          rows: []
        }, { status: 404 })
      }
      throw err
    }

    // For metadata, return as-is
    if (level === 'metadata') {
      return Response.json(data)
    }

    // Filter by year if specified
    if (year && Array.isArray(data)) {
      const yearInt = parseInt(year)
      data = data.filter(row => row.year === yearInt)
    }

    return Response.json({
      level,
      state: state || null,
      year: year || null,
      count: Array.isArray(data) ? data.length : 1,
      rows: data
    })

  } catch (error) {
    console.error('FBI Crime API error:', error)
    return Response.json({ error: error.message, rows: [] }, { status: 500 })
  }
}
