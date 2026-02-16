'use client'
import { useState, useEffect, useMemo } from 'react'

const DataRow = ({ label, value, highlight }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a1a' }}>
    <span style={{ color: '#999', fontSize: '13px' }}>{label}</span>
    <span style={{ color: highlight || '#fff', fontSize: '13px', fontWeight: '600' }}>{value}</span>
  </div>
)

const DataBlock = ({ title, children, style }) => (
  <div style={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: '6px', padding: '12px 16px', margin: '16px 0', ...style }}>
    {title && <div style={{ fontSize: '12px', fontWeight: '700', color: '#fff', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>{title}</div>}
    {children}
  </div>
)

const P = ({ children }) => (
  <p style={{ fontSize: '17px', lineHeight: '1.7', color: '#ccc', margin: '0 0 16px 0' }}>{children}</p>
)

function Feb15Post() {
  return (
    <>
      <P>I added Day of Week (DoW) filters to the year over year (YoY) charts on both the <a href="/rs-population" style={{ color: '#4ade80' }}>Population</a> and <a href="/rs-trends" style={{ color: '#4ade80' }}>Trends</a> pages. You can now compare Daily (all days), DoW (e.g., all Sundays vs. all Sundays), or Monthly averages across years.</P>

      <P><strong style={{ color: '#fff' }}>Why does this matter?</strong> Sunday is typically the highest population day on RuneScape, while midweek days tend to be lower. When you look at a YoY chart using daily data, you're comparing a Sunday in 2026 against a Wednesday in 2025, which is not an apples:apples comparison. The DoW filter fixes this by aligning the same weekday across years. That said, the daily view can still be useful for spotting broader patterns.</P>

      <P>I also noticed that the regression trendlines on the <a href="/rs-trends" style={{ color: '#4ade80' }}>Trends</a> page were sometimes showing player gains even when recent data clearly showed a sustained downtrend. The issue was in how seasonality was being handled.</P>

      <DataBlock title="What Changed">
        <DataRow label="Old method" value="Seasonal index + Theil-Sen" />
        <DataRow label="New method" value="Fourier regression (OLS)" />
      </DataBlock>

      <P>The old approach computed a multiplicative seasonal index by averaging each day of the year across all available years, then dividing by the global mean. The problem is that if the population in 2013 was 60,000 and in 2026 it's 21,000, those values get averaged together, contaminating the seasonal adjustment. It also averaged out the weekly cycle entirely, since Monday through Sunday all fell on different calendar days each year.</P>

      <P>The new method uses Fourier regression, which models the linear trend and seasonal patterns simultaneously. It fits sin/cos harmonics at weekly (period = 7 days) and annual (period = 365.25 days) frequencies using ordinary least squares (OLS). This means the weekly cycle (weekday vs. weekend) and annual seasonality (summer lows, holiday spikes) are estimated alongside the trend, not separately. The result is a regression line that strips out both weekly and annual noise to give a more accurate estimate of the actual direction of population change.</P>

      <DataBlock title="Harmonic Configuration by Chart Window">
        <DataRow label="All-Time, 5-Year" value="Weekly (3) + Annual (3)" />
        <DataRow label="1-Year and below" value="Weekly (3) only" />
      </DataBlock>

      <P>Annual harmonics are only used on windows with 2+ years of data. On shorter windows (1 year, 6 months, 3 months, 1 month), only weekly harmonics are applied, because annual harmonics overfit when you have less than a full cycle. I discovered this the hard way when testing the 6-month regression line went from 0 to 40,000, which was clearly wrong.</P>

      <P>The trendlines are now tighter, more responsive to recent data, and better aligned with what the moving averages show. If the data says RS3 is flat or declining, the regression will reflect that instead of being pulled by stale seasonal estimates from a decade ago.</P>

      <P><strong style={{ color: '#fff' }}>In conclusion,</strong> these estimates are much closer to reality. Jagex likely has their own data scientists sweating over these numbers, one would hope. Jagex does have a major update scheduled for next week, the <a href="https://secure.runescape.com/m=news/road-to-restoration--early-game-rebalance--dailyscape-overhaul" target="_blank" rel="noopener" style={{ color: '#4ade80' }}>Early Game Rebalance</a> (part of the Road to Restoration), that will likely increase concurrent player counts and people hitting the hiscores. We will see.</P>

      <P>We are currently looking at the lowest hiscores period since October 2025. As of February 15, weekly accounts on hiscores sit at 134,375, the 4th lowest week out of 110 weeks on record, only above the late September/early October 2025 trough (which bottomed at 127,225).</P>

      <P>This does not bode well for the game. Expect some major motion next week.</P>
    </>
  )
}

function WelcomePost() {
  return (
    <>
      <P>The site has been updated to what I hope will be a somewhat final version, amenable to feedback of course, with charts and data that are easily accessible and usable by anyone. And for RS data will always be free for use. I don't even run ads, although I may in the future.</P>

      <P>A bit about me: I have many strong feelings on RS3. I don't play frequently, but I'm maxed. I've been maxed in most skills essentially since 2008. I don't intend to play much this year, although I am a premier member on two separate accounts. I appreciate RS3 and want to see it be successful.</P>

      <div style={{ margin: '16px 0', textAlign: 'center' }}>
        <img src="/images/99smith.png" alt="99 Smithing - Early 2008" style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid #222' }} />
        <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>99 Smithing, early 2008. 99 Crafting followed that summer.</div>
      </div>

      <P>This site is not an attempt to p-hack or lie with data or push whatever other narratives people have had and will have about me. The purpose is to be transparent, responsible, and honest about changes.</P>

      <P>Overall, now that I have a full inventory of data and analysis I trust, I have thoughts on recent changes: I've noticed over the last decade that Jagex becomes especially antsy when the core player counts drop to or below an average of 20K people. At that point, I believe the corporate emails are being fired off frantically and courses are being corrected. I see no difference here.</P>

      <DataBlock title="RS3 Average Population by Year">
        <DataRow label="2020" value="31,484" />
        <DataRow label="2021" value="33,386" />
        <DataRow label="2022" value="25,714" />
        <DataRow label="2023" value="24,476" />
        <DataRow label="2024" value="20,876" highlight="#ef4444" />
        <DataRow label="2025" value="20,759" highlight="#ef4444" />
        <DataRow label="2026 (YTD)" value="21,971" highlight="#eab308" />
      </DataBlock>

      <P>Over the last couple of years, RS3 players have been routinely complaining about the lack of new content, the overuse of rare items and FOMO, and if you look at the last 5 year chart there has been a decline of 2,595 players on average per year. And only in the last year and only after beginning course correction has there been an uptick of 4K players per year (growth).</P>

      <DataBlock title="5-Year Trendline">
        <DataRow label="Avg yearly decline (5yr)" value="-2,595 players/yr" highlight="#ef4444" />
        <DataRow label="1-Year trend (recent)" value="+4,050 players/yr" highlight="#4ade80" />
      </DataBlock>

      <P>While this trend looks positive, the impetus for it seems to be just how major the changes have been that Jagex is implementing. Removing Treasure Hunter, removing items, removing many things, actually, including gameplay loops (<a href="https://secure.runescape.com/m=news/a-new-era-for-runescape-begins-january-19-2026" target="_blank" rel="noopener" style={{ color: '#4ade80' }}>see the full announcement</a>). Changes so drastic even I came back after almost a year hiatus to get rid of my items before they were deleted. It looks like many people were doing the same.</P>

      <P>I see a lot of people hyping these changes. And I see many in fear of them.</P>

      <P>At a very high, superficial level these changes look positive (and maybe they will sustain); however, digging into the drivers of these numbers reveals nothing much has changed. RS3 has a lot of seasonality at the end of the year (see below). And these dramatic announcements by Jagex have brought people back, but has it been to play the game again or out of fear and shock?</P>

      <DataBlock title="Q4 (Oct-Dec) vs Full Year Average">
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #333', marginBottom: '4px' }}>
          <span style={{ color: '#fff', fontSize: '12px', fontWeight: '700' }}>Year</span>
          <div style={{ display: 'flex', gap: '24px' }}>
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: '700', width: '70px', textAlign: 'right' }}>Full Yr</span>
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: '700', width: '70px', textAlign: 'right' }}>Q4</span>
            <span style={{ color: '#fff', fontSize: '12px', fontWeight: '700', width: '60px', textAlign: 'right' }}>Change</span>
          </div>
        </div>
        {[
          { yr: '2014', full: '34,152', q4: '37,372', pct: '+9.4%', color: '#4ade80' },
          { yr: '2015', full: '35,192', q4: '31,280', pct: '-11.1%', color: '#ef4444' },
          { yr: '2016', full: '29,969', q4: '26,241', pct: '-12.4%', color: '#ef4444' },
          { yr: '2017', full: '27,961', q4: '24,810', pct: '-11.3%', color: '#ef4444' },
          { yr: '2018', full: '24,725', q4: '23,764', pct: '-3.9%', color: '#ef4444' },
          { yr: '2019', full: '21,687', q4: '18,985', pct: '-12.5%', color: '#ef4444' },
          { yr: '2020', full: '31,484', q4: '33,853', pct: '+7.5%', color: '#4ade80' },
          { yr: '2021', full: '33,386', q4: '31,373', pct: '-6.0%', color: '#ef4444' },
          { yr: '2022', full: '25,714', q4: '26,153', pct: '+1.7%', color: '#4ade80' },
          { yr: '2023', full: '24,476', q4: '23,852', pct: '-2.5%', color: '#ef4444' },
          { yr: '2024', full: '20,876', q4: '24,358', pct: '+16.7%', color: '#eab308' },
          { yr: '2025', full: '20,759', q4: '21,145', pct: '+1.9%', color: '#4ade80' },
          { yr: '2026 (YTD)', full: '21,971', q4: '\u2014', pct: '\u2014', color: '#666' },
        ].map(r => (
          <div key={r.yr} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1a1a1a' }}>
            <span style={{ color: '#999', fontSize: '13px' }}>{r.yr}</span>
            <div style={{ display: 'flex', gap: '24px' }}>
              <span style={{ color: '#fff', fontSize: '13px', width: '70px', textAlign: 'right' }}>{r.full}</span>
              <span style={{ color: '#fff', fontSize: '13px', width: '70px', textAlign: 'right' }}>{r.q4}</span>
              <span style={{ color: r.color, fontSize: '13px', fontWeight: '600', width: '60px', textAlign: 'right' }}>{r.pct}</span>
            </div>
          </div>
        ))}
        <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>2024 Q4 spike (+16.7%) was the largest since 2014. 2025 Q4 returned to a modest +1.9%, closer to historical norms.</div>
      </DataBlock>

      <P>The question is not whether population totals went up. They have. The question is whether that has been sustained, and as of right now, 2026 YTD is averaging 21,971 players. That is above 2025's average of 20,759, but it is still well below the 24,000-25,000 range that RS3 sat at just a few years ago. A month and a half into 2026 with 1K more total players when massive content changes have been announced is not a fact pattern... yet.</P>

      <P>The <a href="/rs-trends" style={{ color: '#4ade80' }}>Trends page</a> on this site controls for seasonality using a multiplicative day-of-year seasonal index. For every day of the year (1-366), the index computes the average population on that day across all available years, divided by the global mean. Trendline regressions are run on seasonally-adjusted values. When you strip out seasonality effects, the underlying trajectory is clearer, and what it shows is that RS3 is still in a 5-year decline that recently flattened. See below. The table has gone from 23K per week to now being roughly 21K per week.</P>

      <DataBlock title="Weekly Average RS3 Population (Recent)">
        {[
          { wk: 'Dec 1-7', val: '23,079', color: '#fff' },
          { wk: 'Dec 8-14', val: '22,630', color: '#fff' },
          { wk: 'Dec 15-21', val: '22,059', color: '#fff' },
          { wk: 'Dec 22-28', val: '22,168', color: '#fff' },
          { wk: 'Dec 29-31', val: '22,403', color: '#fff' },
          { wk: 'Jan 1-4', val: '23,450', color: '#4ade80' },
          { wk: 'Jan 5-11', val: '22,586', color: '#fff' },
          { wk: 'Jan 12-18', val: '20,922', color: '#ef4444' },
          { wk: 'Jan 19-25', val: '22,509', color: '#fff' },
          { wk: 'Jan 26 - Feb 1', val: '22,270', color: '#fff' },
          { wk: 'Feb 2-8', val: '21,309', color: '#ef4444' },
          { wk: 'Feb 9-12', val: '20,958', color: '#ef4444' },
        ].map(r => (
          <div key={r.wk} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1a1a1a' }}>
            <span style={{ color: '#999', fontSize: '13px' }}>{r.wk}</span>
            <span style={{ color: r.color, fontSize: '13px', fontWeight: '600' }}>{r.val}</span>
          </div>
        ))}
        <div style={{ fontSize: '11px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>Jan 1-4 spiked to 23,450 after the Jagex announcements. Six weeks later, back to 20,958.</div>
      </DataBlock>

      <P>I have seen more interest in RS3 lately, and that is a good thing. I have seen some streamers coming back (<a href="https://www.youtube.com/watch?v=NaxJSqTEcEk" target="_blank" rel="noopener" style={{ color: '#4ade80' }}>A Friend</a>, for example). And there have been many positive changes. Removing bloat, Tutorial Island returning, spawning at Lumbridge, etc. Many of the changes and reversions look smart. However, fully removing MTX lamps rather than gatekeeping them, removing events, reducing AFK... all of this makes the game harder. And I do not think that should be the goal when your average player is roughly 30 years old. (I agree with <a href="https://www.youtube.com/watch?v=_b6LzJ4Xum8" target="_blank" rel="noopener" style={{ color: '#4ade80' }}>Protoxx's sentiments</a>, essentially, which were also seen as unpopular.)</P>

      <P>I leveled my skills when Mining and Agility, for example, were 30K xp per hour at max in 2007. That is 10 hours per day for 30 days for each skill. I was ranked 778 in the world at 97 Mining. No one should need to do that. No one.</P>

      <P>One thing I've learned over the years is that things change. And they should. Because I did it the hard way doesn't mean everyone should need to do it the same way. What matters, ultimately, isn't an achievement, isn't bragging rights, it's just having a good time. I don't think back to getting 99 Hunter with glee, I think about how it gave me carpal tunnel and was a massive waste of time, overall.</P>

      <div style={{ margin: '16px 0', textAlign: 'center' }}>
        <img src="/images/98mining.png" alt="97 Mining - Ranked 778 in the world" style={{ maxWidth: '100%', borderRadius: '6px', border: '1px solid #222' }} />
        <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>Ranked 778 in the world at 97 Mining, 2007.</div>
      </div>

      <P>Overall, most people who play RS3 do not have time for it. Even Jagex knows this. CEO Jon Bellamy said in January 2026 that the playerbase "used to be angsty 16-year-olds listening to Breaking Benjamin. Now it's 33-year-old accountants and CEOs who've got 41 minutes in an evening" (<a href="https://www.gamesradar.com/games/mmo/stating-no-lies-runescape-ceo-says-the-mmos-players-used-to-be-angsty-16-year-olds-listening-to-breaking-benjamin-now-its-33-year-old-accountants-and-ceos-whove-got-41-minutes-in-an-evening/" target="_blank" rel="noopener" style={{ color: '#4ade80' }}>GamesRadar</a>). 41 minutes. 41 minutes. And the expectation is to spend 1000s of hours getting skills maxed?</P>

      <P>Why is Jagex making changes that will essentially run off older players? My guess is they're counting on newer players to come in when they see people streaming the game on Twitch. I will say this, right now, things don't look as rosy as they could, but they could also look worse. Let's hope this game of chicken Jagex is playing works out. I don't care that I don't rank on hiscores anymore, but I would care if the game died.</P>

      <P>I'm overall neutral on the changes. I think some people do want to see RS3 die. Others, I believe, are wrong. But there is a lot of data abuse and misinformation right now. Even A Friend called a secular event, a <a href="https://en.wikipedia.org/wiki/January_2026_North_American_winter_storm" target="_blank" rel="noopener" style={{ color: '#4ade80' }}>massive snowstorm in the US</a>, a good day for RS's new changes when there is likely no correlation.</P>

      <P>In conclusion, I just want this site to function where there is a blind spot in what's happening with the game.</P>

    </>
  )
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const posts = [
  { date: '2026-02-15', title: 'Fixed Some Issues', content: Feb15Post },
  { date: '2026-02-12', title: 'Welcome to aggrgtr', content: WelcomePost },
]

function buildArchive(posts) {
  const tree = {}
  posts.forEach((post, idx) => {
    const d = new Date(post.date + 'T12:00:00')
    const year = d.getFullYear()
    const month = d.getMonth()
    if (!tree[year]) tree[year] = {}
    if (!tree[year][month]) tree[year][month] = []
    tree[year][month].push({ ...post, idx })
  })
  return tree
}

export default function BlogPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedYears, setExpandedYears] = useState({})
  const [expandedMonths, setExpandedMonths] = useState({})

  const archive = useMemo(() => buildArchive(posts), [])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Default: expand current year and current month
  useEffect(() => {
    const now = new Date()
    const yr = now.getFullYear()
    const mo = now.getMonth()
    setExpandedYears({ [yr]: true })
    setExpandedMonths({ [`${yr}-${mo}`]: true })
  }, [])

  const toggleYear = (yr) => {
    setExpandedYears(prev => ({ ...prev, [yr]: !prev[yr] }))
  }

  const toggleMonth = (key) => {
    setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const scrollToPost = (date) => {
    const el = document.getElementById(`post-${date}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (isMobile) setSidebarOpen(false)
  }

  const years = Object.keys(archive).sort((a, b) => b - a)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
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
        {isMobile ? (
          /* Mobile: toggle bar + expandable panel */
          <>
            <div
              onClick={() => setSidebarOpen(prev => !prev)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderBottom: '1px solid #222', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: '14px', color: '#999', transform: sidebarOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>Menu</span>
            </div>
            {sidebarOpen && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #222' }}>
                {/* Dashboard links */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', textDecoration: 'none' }}>Population</a>
                  <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', textDecoration: 'none' }}>OSRS Worlds</a>
                  <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', textDecoration: 'none' }}>Hiscores</a>
                  <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', textDecoration: 'none' }}>Trends</a>
                  <a href="/blog" style={{ background: '#222', border: 'none', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '11px', textDecoration: 'none', fontWeight: '600' }}>Blog</a>
                </div>

                {/* Archive tree */}
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Archive</div>
                {years.map(yr => {
                  const months = Object.keys(archive[yr]).sort((a, b) => b - a)
                  const yrOpen = expandedYears[yr]
                  return (
                    <div key={yr}>
                      <div onClick={() => toggleYear(yr)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ fontSize: '10px', color: '#666', transform: yrOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>{yr}</span>
                      </div>
                      {yrOpen && months.map(mo => {
                        const moKey = `${yr}-${mo}`
                        const moOpen = expandedMonths[moKey]
                        const entries = archive[yr][mo]
                        return (
                          <div key={moKey} style={{ paddingLeft: '16px' }}>
                            <div onClick={() => toggleMonth(moKey)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', cursor: 'pointer', userSelect: 'none' }}>
                              <span style={{ fontSize: '9px', color: '#666', transform: moOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
                              <span style={{ fontSize: '13px', color: '#ccc' }}>{MONTH_NAMES[mo]}</span>
                              <span style={{ fontSize: '11px', color: '#555' }}>({entries.length})</span>
                            </div>
                            {moOpen && entries.map(entry => (
                              <div
                                key={entry.date}
                                onClick={() => scrollToPost(entry.date)}
                                style={{ paddingLeft: '22px', padding: '3px 0 3px 22px', cursor: 'pointer', fontSize: '12px', color: '#4ade80', userSelect: 'none' }}
                              >
                                {entry.title}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          /* Desktop: collapsible sidebar */
          <aside style={{
            width: sidebarOpen ? '220px' : '40px',
            minWidth: sidebarOpen ? '220px' : '40px',
            transition: 'width 0.2s, min-width 0.2s',
            borderRight: '1px solid #222',
            overflow: 'hidden',
            position: 'sticky',
            top: 0,
            alignSelf: 'flex-start',
            maxHeight: '100vh',
            overflowY: 'auto',
          }}>
            {/* Toggle button */}
            <div
              onClick={() => setSidebarOpen(prev => !prev)}
              style={{ padding: '12px', cursor: 'pointer', textAlign: sidebarOpen ? 'right' : 'center', userSelect: 'none' }}
            >
              <span style={{ fontSize: '14px', color: '#666', display: 'inline-block', transform: sidebarOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>&#9654;</span>
            </div>

            {sidebarOpen && (
              <div style={{ padding: '0 24px 24px 24px' }}>
                {/* Dashboard links */}
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>Dashboards</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
                  <a href="/rs-population" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none' }}>Population</a>
                  <a href="/osrs-worlds" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none' }}>OSRS Worlds</a>
                  <a href="/hiscores" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none' }}>Hiscores</a>
                  <a href="/rs-trends" style={{ background: 'transparent', border: '1px solid #333', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none' }}>Trends</a>
                  <a href="/blog" style={{ background: '#222', border: 'none', color: '#fff', padding: '6px 8px', borderRadius: '4px', fontSize: '16px', textDecoration: 'none', fontWeight: '600' }}>Blog</a>
                </div>

                {/* Archive tree */}
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Archive</div>
                {years.map(yr => {
                  const months = Object.keys(archive[yr]).sort((a, b) => b - a)
                  const yrOpen = expandedYears[yr]
                  return (
                    <div key={yr}>
                      <div onClick={() => toggleYear(yr)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ fontSize: '10px', color: '#666', transform: yrOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#fff' }}>{yr}</span>
                      </div>
                      {yrOpen && months.map(mo => {
                        const moKey = `${yr}-${mo}`
                        const moOpen = expandedMonths[moKey]
                        const entries = archive[yr][mo]
                        return (
                          <div key={moKey} style={{ paddingLeft: '16px' }}>
                            <div onClick={() => toggleMonth(moKey)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0', cursor: 'pointer', userSelect: 'none' }}>
                              <span style={{ fontSize: '9px', color: '#666', transform: moOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9654;</span>
                              <span style={{ fontSize: '13px', color: '#ccc' }}>{MONTH_NAMES[mo]}</span>
                              <span style={{ fontSize: '11px', color: '#555' }}>({entries.length})</span>
                            </div>
                            {moOpen && entries.map(entry => (
                              <div
                                key={entry.date}
                                onClick={() => scrollToPost(entry.date)}
                                style={{ paddingLeft: '22px', padding: '3px 0 3px 22px', cursor: 'pointer', fontSize: '12px', color: '#4ade80', userSelect: 'none' }}
                              >
                                {entry.title}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </aside>
        )}

        {/* Main */}
        <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 20px', maxWidth: '800px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '36px', fontWeight: '600', letterSpacing: '-1px', color: '#fff', margin: '0 0 32px 0' }}>Blog</h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {posts.map((post) => {
              const Content = post.content
              return (
                <article key={post.date} id={`post-${post.date}`} style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: isMobile ? '16px' : '24px', scrollMarginTop: '16px' }}>
                  <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>{new Date(post.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                  <h2 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '600', color: '#fff', margin: '0 0 16px 0' }}>{post.title}</h2>
                  <Content />
                </article>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}
