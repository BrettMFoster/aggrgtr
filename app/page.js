export default function Home() {
  return (
    <main>
      {/* Navigation */}
      <nav style={styles.nav}>
        <div style={styles.logo}>aggrgtr</div>
        <a href="#waitlist" style={styles.navLink}>Get Early Access</a>
      </nav>

      {/* Hero */}
      <section style={styles.hero}>
        <h1 style={styles.h1}>Government data, simplified.</h1>
        <p style={styles.subtitle}>
          Clean, structured public data for small businesses.
          Crime statistics, census demographics, and school ratings —
          without the enterprise price tag.
        </p>
        <div style={styles.cta}>
          <a href="#waitlist" style={styles.primaryBtn}>Join the Waitlist</a>
          <span style={styles.pricing}>Plans starting at $49/mo</span>
        </div>
      </section>

      {/* Problem/Solution */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.h2}>The problem</h2>
          <p style={styles.paragraph}>
            Government data is free but messy. Cleaning FBI crime data or Census demographics
            takes hours. Enterprise solutions cost $2,000+/month. Small businesses get left out.
          </p>
          <h2 style={{...styles.h2, marginTop: '48px'}}>Our solution</h2>
          <p style={styles.paragraph}>
            We clean and normalize public data sources so you can focus on insights, not data wrangling.
            Download ready-to-use datasets or access via API.
          </p>
        </div>
      </section>

      {/* Data Sources */}
      <section style={{...styles.section, background: '#fafafa'}}>
        <div style={styles.container}>
          <h2 style={styles.h2}>Available Data</h2>
          <div style={styles.grid}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Crime Statistics</h3>
              <p style={styles.cardText}>FBI UCR data by county, cleaned and normalized per capita</p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Census Demographics</h3>
              <p style={styles.cardText}>Population, income, age, and housing data from ACS</p>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>School Districts</h3>
              <p style={styles.cardText}>Test scores, ratings, and spending per student</p>
            </div>
          </div>
          <p style={styles.comingSoon}>More datasets coming soon: building permits, health inspections, business licenses</p>
        </div>
      </section>

      {/* Who it's for */}
      <section style={styles.section}>
        <div style={styles.container}>
          <h2 style={styles.h2}>Built for</h2>
          <div style={styles.tagContainer}>
            {['Real Estate Agents', 'Insurance Underwriters', 'Small Investors', 'Researchers', 'Journalists', 'Startups'].map(tag => (
              <span key={tag} style={styles.tag}>{tag}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" style={{...styles.section, background: '#fafafa'}}>
        <div style={styles.container}>
          <h2 style={styles.h2}>Get early access</h2>
          <p style={styles.paragraph}>Join the waitlist for launch updates and early-bird pricing.</p>
          <form style={styles.form} action="https://formspree.io/f/placeholder" method="POST">
            <input
              type="email"
              name="email"
              placeholder="you@company.com"
              required
              style={styles.input}
            />
            <button type="submit" style={styles.submitBtn}>Join Waitlist</button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>© 2025 aggrgtr</p>
      </footer>
    </main>
  )
}

const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 48px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '600',
    letterSpacing: '-0.5px',
  },
  navLink: {
    fontSize: '14px',
    color: '#666',
  },
  hero: {
    textAlign: 'center',
    padding: '80px 24px 100px',
    maxWidth: '700px',
    margin: '0 auto',
  },
  h1: {
    fontSize: '48px',
    fontWeight: '600',
    letterSpacing: '-1.5px',
    marginBottom: '24px',
    lineHeight: '1.1',
  },
  subtitle: {
    fontSize: '18px',
    color: '#555',
    marginBottom: '40px',
    lineHeight: '1.7',
  },
  cta: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  primaryBtn: {
    background: '#0a0a0a',
    color: '#fff',
    padding: '14px 32px',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '500',
  },
  pricing: {
    fontSize: '14px',
    color: '#888',
  },
  section: {
    padding: '80px 24px',
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  h2: {
    fontSize: '28px',
    fontWeight: '600',
    letterSpacing: '-0.5px',
    marginBottom: '16px',
  },
  paragraph: {
    fontSize: '16px',
    color: '#555',
    lineHeight: '1.7',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '24px',
    marginTop: '32px',
  },
  card: {
    background: '#fff',
    border: '1px solid #eaeaea',
    borderRadius: '8px',
    padding: '24px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  cardText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
  },
  comingSoon: {
    marginTop: '32px',
    fontSize: '14px',
    color: '#888',
    fontStyle: 'italic',
  },
  tagContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginTop: '24px',
  },
  tag: {
    background: '#f5f5f5',
    border: '1px solid #eaeaea',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '14px',
    color: '#444',
  },
  form: {
    display: 'flex',
    gap: '12px',
    marginTop: '32px',
    flexWrap: 'wrap',
  },
  input: {
    padding: '14px 16px',
    fontSize: '15px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    minWidth: '280px',
    outline: 'none',
  },
  submitBtn: {
    background: '#0a0a0a',
    color: '#fff',
    padding: '14px 28px',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
  },
  footer: {
    padding: '40px 24px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#888',
    borderTop: '1px solid #eaeaea',
  },
}
