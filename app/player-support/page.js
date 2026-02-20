'use client'
import { useState, useEffect } from 'react'
import useSWR from 'swr'

const fmtK = (v) => {
  if (v >= 1000000) return (v / 1000000).toFixed(v % 1000000 === 0 ? 0 : 1) + 'M'
  if (v >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'K'
  return v.toString()
}

const fmtGP = (v) => {
  if (v == null) return '-'
  if (v >= 1e12) return (v / 1e12).toFixed(1) + 'T'
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M'
  return v.toLocaleString()
}

const fmtNum = (v) => v != null ? v.toLocaleString() : '-'

const shortMonth = (name) => {
  if (!name) return ''
  return name.split(' ')[0].substring(0, 3)
}

// Dual-axis line chart: left axis for series[0], right axis for series[1]
function DualChart({ rows, title, series, formatter, isMobile }) {
  const [hovered, setHovered] = useState(-1)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const w = isMobile ? 440 : 680
  const h = 280
  const left = isMobile ? 40 : 44
  const right = isMobile ? 400 : 636
  const top = 10
  const bottom = 240
  const chartW = right - left
  const chartH = bottom - top

  // Compute separate scales per series
  const scales = series.map(s => {
    let max = 0, min = Infinity
    for (const r of rows) {
      const v = r[s.field]
      if (v != null) { if (v > max) max = v; if (v < min) min = v }
    }
    if (min === Infinity) min = 0
    const range = max - min
    return {
      max: max + range * 0.1,
      min: Math.max(0, min - range * 0.15),
    }
  })

  const getX = (i) => left + (i / Math.max(rows.length - 1, 1)) * chartW
  const getY = (v, scale) => {
    const range = scale.max - scale.min || 1
    return bottom - ((v - scale.min) / range) * chartH
  }

  const fmtAxis = formatter || fmtK

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const svgX = (x / rect.width) * w
    setMousePos({ x: e.clientX, y: e.clientY })
    let closest = -1, closestDist = Infinity
    for (let i = 0; i < rows.length; i++) {
      const dist = Math.abs(svgX - getX(i))
      if (dist < closestDist) { closestDist = dist; closest = i }
    }
    setHovered(closestDist < 50 ? closest : -1)
  }

  return (
    <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '8px 6px' : '10px 6px' }}>
      <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', marginBottom: '4px', paddingLeft: '4px' }}>{title}</div>

      <div
        style={{ height: isMobile ? '240px' : '320px', cursor: 'crosshair' }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(-1)}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = bottom - pct * chartH
            return <line key={pct} x1={left} y1={y} x2={right} y2={y} stroke="#222" strokeWidth="0.5" />
          })}

          {/* Left Y-axis labels (series[0]) */}
          {scales[0] && [0, 0.5, 1].map(pct => {
            const val = scales[0].min + pct * (scales[0].max - scales[0].min)
            const y = bottom - pct * chartH
            return (
              <text key={`l${pct}`} x={left - 4} y={y + 4} fill={series[0].color} fontSize={isMobile ? '13' : '13'} textAnchor="end" style={{ fontFamily: 'monospace' }}>{fmtAxis(Math.round(val))}</text>
            )
          })}

          {/* Right Y-axis labels (series[1]) */}
          {series.length > 1 && scales[1] && [0, 0.5, 1].map(pct => {
            const val = scales[1].min + pct * (scales[1].max - scales[1].min)
            const y = bottom - pct * chartH
            return (
              <text key={`r${pct}`} x={right + 4} y={y + 4} fill={series[1].color} fontSize={isMobile ? '13' : '13'} textAnchor="start" style={{ fontFamily: 'monospace' }}>{fmtAxis(Math.round(val))}</text>
            )
          })}

          {/* X-axis labels */}
          {rows.map((r, i) => (
            <text key={i} x={getX(i)} y={bottom + 18} fill="#fff" fontSize={isMobile ? '13' : '13'} fontWeight="600" textAnchor="middle">
              {shortMonth(r.month_name)}
            </text>
          ))}

          {/* Lines and areas per series */}
          {series.map((s, si) => {
            const scale = scales[si]
            if (!scale) return null
            const points = rows.map((r, i) => {
              const v = r[s.field]
              if (v == null) return null
              return { x: getX(i), y: getY(v, scale), i }
            }).filter(Boolean)
            if (points.length === 0) return null

            return (
              <g key={s.field}>
                <path
                  d={`M ${points[0].x},${bottom} ${points.map(p => `L ${p.x},${p.y}`).join(' ')} L ${points[points.length - 1].x},${bottom} Z`}
                  fill={`${s.color}15`}
                />
                <path
                  d={`M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`}
                  fill="none" stroke={s.color} strokeWidth="2.5"
                />
                {points.map((p, pi) => (
                  <circle key={pi} cx={p.x} cy={p.y} r={hovered === p.i ? 5 : 3.5} fill={s.color} stroke="#111" strokeWidth="1.5" />
                ))}
              </g>
            )
          })}

          {/* Hover line */}
          {hovered >= 0 && (
            <line x1={getX(hovered)} y1={top} x2={getX(hovered)} y2={bottom} stroke="#666" strokeWidth="1" strokeDasharray="3" />
          )}
        </svg>
      </div>

      {/* Tooltip */}
      {hovered >= 0 && hovered < rows.length && (() => {
        const tooltipWidth = 180
        const tooltipHeight = 90
        const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1000
        const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800
        const spaceOnRight = screenWidth - mousePos.x
        const spaceOnBottom = screenHeight - mousePos.y
        const ttLeft = spaceOnRight < tooltipWidth + 30 ? mousePos.x - tooltipWidth - 15 : mousePos.x + 15
        const ttTop = spaceOnBottom < tooltipHeight + 20 ? mousePos.y - tooltipHeight : mousePos.y - 40
        return (
          <div style={{
            position: 'fixed',
            left: ttLeft,
            top: ttTop,
            background: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '8px',
            padding: '12px 16px',
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: '160px'
          }}>
            <div style={{ fontSize: '13px', color: '#fff', marginBottom: '8px', fontWeight: '600', borderBottom: '1px solid #333', paddingBottom: '8px' }}>
              {rows[hovered].month_name}
            </div>
            {series.map(s => {
              const v = rows[hovered][s.field]
              return (
                <div key={s.field} style={{ fontSize: '14px', color: '#fff', marginBottom: '4px' }}>
                  <span style={{ color: s.color, fontWeight: '700' }}>{s.label}:</span> {formatter ? formatter(v) : fmtNum(v)}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Legend - bottom */}
      <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', padding: '3px 0 0 0', borderTop: '1px solid #222', marginTop: '2px' }}>
        {series.map(s => (
          <div key={s.field} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            <div style={{ width: '12px', height: '3px', background: s.color, borderRadius: '2px' }} />
            <span style={{ color: '#fff', fontWeight: '500' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlayerSupport() {
  const [isMobile, setIsMobile] = useState(false)

  const { data: apiData, error } = useSWR('/api/player-support', { refreshInterval: 3600000 })

  const loading = !apiData
  const rows = apiData?.rows || []
  const latest = apiData?.latest || {}

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const charts = [
    {
      title: 'Macro Bans',
      series: [
        { field: 'macro_bans_osrs', label: 'OSRS', color: '#4ade80' },
        { field: 'macro_bans_rs3', label: 'RS3', color: '#60a5fa' },
      ],
    },
    {
      title: 'GP Removed',
      series: [
        { field: 'gp_removed_osrs', label: 'OSRS', color: '#f59e0b' },
        { field: 'gp_removed_rs3', label: 'RS3', color: '#c084fc' },
      ],
      formatter: fmtGP,
    },
    {
      title: 'RWT Bans',
      series: [
        { field: 'rwt_bans_osrs', label: 'OSRS', color: '#f87171' },
        { field: 'rwt_bans_rs3', label: 'RS3', color: '#fb923c' },
      ],
    },
    {
      title: 'Support Volume',
      series: [
        { field: 'support_queries', label: 'Queries', color: '#38bdf8' },
        { field: 'support_center_views', label: 'Center Views', color: '#a78bfa' },
      ],
    },
    {
      title: 'Reports & Chat Spam',
      series: [
        { field: 'report_action_msgs', label: 'Report Actions', color: '#fbbf24' },
        { field: 'chat_spam_mutes', label: 'Chat Spam Mutes', color: '#34d399' },
      ],
    },
    {
      title: 'Response Time & Satisfaction',
      series: [
        { field: 'avg_response_time_hrs', label: 'Hours', color: '#f87171' },
        { field: 'ticket_satisfaction_pct', label: 'Satisfaction %', color: '#4ade80' },
      ],
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Nav */}
      <nav style={{ borderBottom: '1px solid #222', padding: isMobile ? '12px 16px' : '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600', fontSize: isMobile ? '16px' : '18px' }}>aggrgtr</a>
        <div style={{ display: 'flex', gap: isMobile ? '12px' : '24px', alignItems: 'center', fontSize: isMobile ? '13px' : undefined }}>
          <a href="https://paypal.me/aggrgtr" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontWeight: '500' }}>Donate</a>
          <a href="/subscribe" style={{ color: '#fff', textDecoration: 'none' }}>Subscribe</a>
          <a href="/" style={{ color: '#fff', textDecoration: 'none' }}>Datasets</a>
          <a href="https://discord.gg/E6z2CEUknK" target="_blank" rel="noopener" style={{ color: '#5865F2', textDecoration: 'none', fontWeight: '500' }}>Discord</a>
        </div>
      </nav>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', maxWidth: '1400px', margin: '0' }}>
        {/* Sidebar */}
        <aside style={{
          width: isMobile ? '100%' : '220px',
          padding: isMobile ? '12px 16px' : '12px 24px 12px 32px',
          borderRight: isMobile ? 'none' : '1px solid #222',
          borderBottom: isMobile ? '1px solid #222' : 'none'
        }}>
          <div style={{ marginBottom: isMobile ? '12px' : '24px' }}>
            {!isMobile && <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Dashboards</div>}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: isMobile ? '4px' : '6px', flexWrap: 'wrap' }}>
              <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Population</a>
              <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Hiscores Counts</a>
              <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Trends</a>
              <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>OSRS Worlds</a>
              <a href="/player-support" style={{ background: '#222', border: 'none', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '600' }}>Player Support</a>
              <a href="/blog" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: isMobile ? '6px 8px' : '6px 8px', borderRadius: '4px', fontSize: isMobile ? '11px' : '16px', textDecoration: 'none', fontWeight: '400' }}>Blog</a>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 8px 0' }}>Player Support & Anti-Cheating</h1>
          <p style={{ fontSize: isMobile ? '14px' : '16px', color: '#fff', margin: '0 0 16px 0' }}>Monthly statistics from Jagex, April 2025 to present</p>

          {loading ? (
            <div style={{ color: '#fff', padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff4444', padding: '40px', textAlign: 'center' }}>Error loading data</div>
          ) : (
            <>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>OSRS Macro Bans</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#4ade80' }}>{fmtK(latest.macro_bans_osrs)}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '4px' }}>{latest.month_name}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>RS3 Macro Bans</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#60a5fa' }}>{fmtK(latest.macro_bans_rs3)}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '4px' }}>{latest.month_name}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>OSRS GP Removed</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#f59e0b' }}>{fmtGP(latest.gp_removed_osrs)}</div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '4px' }}>{latest.month_name}</div>
                </div>
                <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px 12px' : '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: isMobile ? '14px' : '16px', fontWeight: '500', color: '#fff', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: '1.2' }}>Response / Satisfaction</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', lineHeight: '1.2', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#c084fc' }}>
                    {latest.avg_response_time_hrs != null ? `${latest.avg_response_time_hrs}h` : '-'}
                    <span style={{ fontSize: isMobile ? '14px' : '18px', color: '#fff', fontWeight: '400' }}> / </span>
                    {latest.ticket_satisfaction_pct != null ? `${latest.ticket_satisfaction_pct}%` : '-'}
                  </div>
                  <div style={{ fontSize: isMobile ? '11px' : '13px', color: '#fff', marginTop: '4px' }}>{latest.month_name}</div>
                </div>
              </div>

              {/* Chart Grid - 2x2 */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {charts.map((c, i) => (
                  <DualChart key={i} rows={rows} title={c.title} series={c.series} formatter={c.formatter} isMobile={isMobile} />
                ))}
              </div>

              {/* Data Table */}
              <div style={{ background: '#111', border: '1px solid #222', borderRadius: '6px', padding: isMobile ? '10px' : '12px 16px', marginBottom: '16px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#fff', margin: '0 0 12px 0' }}>Monthly Data</h2>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '11px' : '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #333' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'left', color: '#fff', fontWeight: '600', whiteSpace: 'nowrap' }}>Month</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#4ade80', fontWeight: '600', whiteSpace: 'nowrap' }}>OSRS Macro</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#60a5fa', fontWeight: '600', whiteSpace: 'nowrap' }}>RS3 Macro</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#f59e0b', fontWeight: '600', whiteSpace: 'nowrap' }}>OSRS GP</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#c084fc', fontWeight: '600', whiteSpace: 'nowrap' }}>RS3 GP</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#f87171', fontWeight: '600', whiteSpace: 'nowrap' }}>RWT OSRS</th>
                        <th style={{ padding: '8px 6px', textAlign: 'right', color: '#fb923c', fontWeight: '600', whiteSpace: 'nowrap' }}>RWT RS3</th>
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'right', color: '#38bdf8', fontWeight: '600', whiteSpace: 'nowrap' }}>Queries</th>}
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'right', color: '#a78bfa', fontWeight: '600', whiteSpace: 'nowrap' }}>Center Views</th>}
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'right', color: '#fbbf24', fontWeight: '600', whiteSpace: 'nowrap' }}>Report Actions</th>}
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'right', color: '#34d399', fontWeight: '600', whiteSpace: 'nowrap' }}>Chat Spam</th>}
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'right', color: '#fff', fontWeight: '600', whiteSpace: 'nowrap' }}>Resp (hrs)</th>}
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'right', color: '#fff', fontWeight: '600', whiteSpace: 'nowrap' }}>Satisf %</th>}
                        {!isMobile && <th style={{ padding: '8px 6px', textAlign: 'center', color: '#fff', fontWeight: '600', whiteSpace: 'nowrap' }}>Source</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                          <td style={{ padding: '6px', color: '#fff', fontWeight: '500', whiteSpace: 'nowrap' }}>{r.month_name}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.macro_bans_osrs)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.macro_bans_rs3)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtGP(r.gp_removed_osrs)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtGP(r.gp_removed_rs3)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.rwt_bans_osrs)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.rwt_bans_rs3)}</td>
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{r.support_queries != null ? fmtNum(r.support_queries) : '-'}</td>}
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{r.support_center_views != null ? fmtNum(r.support_center_views) : '-'}</td>}
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{r.report_action_msgs != null ? fmtNum(r.report_action_msgs) : '-'}</td>}
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{r.chat_spam_mutes != null ? fmtNum(r.chat_spam_mutes) : '-'}</td>}
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{r.avg_response_time_hrs != null ? r.avg_response_time_hrs : '-'}</td>}
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'right', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{r.ticket_satisfaction_pct != null ? `${r.ticket_satisfaction_pct}%` : '-'}</td>}
                          {!isMobile && <td style={{ padding: '6px', textAlign: 'center' }}>
                            {r.source_url ? (
                              <a href={r.source_url} target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none', fontSize: '11px' }}>Link</a>
                            ) : '-'}
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Attribution */}
              <div style={{ fontSize: '13px', color: '#888', padding: '8px 0' }}>
                Data source: <a href="https://support.runescape.com/hc/en-gb/articles/34686319959441-Player-Support-Anti-Cheating-Statistics" target="_blank" rel="noopener" style={{ color: '#4ade80', textDecoration: 'none' }}>Jagex Player Support & Anti-Cheating Statistics</a>. Archived via Wayback Machine.
              </div>
            </>
          )}
        </main>
      </div>

      <footer style={{ borderTop: '1px solid #222', padding: '16px 32px', fontSize: '13px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <a href="/about" style={{ color: '#fff', textDecoration: 'none' }}>About</a>
          <a href="/privacy" style={{ color: '#fff', textDecoration: 'none' }}>Privacy Policy</a>
        </div>
        <span>aggrgtr 2026 - Not affiliated with Jagex Ltd.</span>
      </footer>
    </div>
  )
}
