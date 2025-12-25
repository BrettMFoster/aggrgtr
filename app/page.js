export default function Home() {
  return (
    <main style={styles.main}>
      <nav style={styles.nav}>
        <div style={styles.logo}>aggrgtr</div>
        <a href="#waitlist" style={styles.navButton}>Join Waitlist</a>
      </nav>

      <section style={styles.hero}>
        <h1 style={styles.heroTitle}>
          Public Data.<br />
          <span style={styles.accent}>Small Business Pricing.</span>
        </h1>
        <p style={styles.heroSubtitle}>
          Clean, structured government data without the enterprise price tag.
          FBI crime stats, census demographics, school ratings, and more.
        </p>
        <div style={styles.pricing}>
          Starting at <span style={styles.price}>$49/mo</span> vs $2,000+/mo enterprise alternatives
        </div>
      </section>

      <section style={styles.dataSection}>
        <h2 style={styles.sectionTitle}>Data Categories</h2>
        <div style={styles.dataGrid}>
          <div style={styles.dataCard}>
            <div style={styles.cardIcon}>📊</div>
            <h3 style={styles.cardTitle}>Crime Statistics</h3>
            <p style={styles.cardDesc}>FBI UCR data by county, cleaned and normalized per capita</p>
          </div>
          <div style={styles.dataCard}>
            <div style={styles.cardIcon}>👥</div>
            <h3 style={styles.cardTitle}>Census Demographics</h3>
            <p style={styles.cardDesc}>Population, income, age, housing from ACS</p>
          </div>
          <div style={styles.dataCard}>
            <div style={styles.cardIcon}>🏫</div>
            <h3 style={styles.cardTitle}>School Districts</h3>
            <p style={styles.cardDesc}>Test scores, ratings, spending per student</p>
          </div>
          <div style={styles.dataCard}>
            <div style={styles.cardIcon}>🏗️</div>
            <h3 style={styles.cardTitle}>Building Permits</h3>
            <p style={styles.cardDesc}>Construction activity and trends</p>
            <span style={styles.comingSoon}>Coming Soon</span>
          </div>
          <div style={styles.dataCard}>
            <div style={styles.cardIcon}>🍽️</div>
            <h3 style={styles.cardTitle}>Health Inspections</h3>
            <p style={styles.cardDesc}>Restaurant inspection scores nationwide</p>
            <span style={styles.comingSoon}>Coming Soon</span>
          </div>
          <div style={styles.dataCard}>
            <div style={styles.cardIcon}>📋</div>
            <h3 style={styles.cardTitle}>Business Licenses</h3>
            <p style={styles.cardDesc}>New business filings and permits</p>
            <span style={styles.comingSoon}>Coming Soon</span>
          </div>
        </div>
      </section>

      <section style={styles.whoSection}>
        <h2 style={styles.sectionTitle}>Built For</h2>
        <div style={styles.whoGrid}>
          <div style={styles.whoCard}>Real Estate Agents</div>
          <div style={styles.whoCard}>Insurance Underwriters</div>
          <div style={styles.whoCard}>Small Investors</div>
          <div style={styles.whoCard}>Researchers</div>
          <div style={styles.whoCard}>Journalists</div>
          <div style={styles.whoCard}>Startups</div>
        </div>
      </section>

      <section id="waitlist" style={styles.waitlist}>
        <h2 style={styles.sectionTitle}>Get Early Access</h2>
        <p style={styles.waitlistText}>
          Join the waitlist for launch updates and early-bird pricing.
        </p>
        <form style={styles.form} action="https://formspree.io/f/placeholder" method="POST">
          <input
            type="email"
            name="email"
            placeholder="you@company.com"
            required
            style={styles.input}
          />
          <button type="submit" style={styles.submitButton}>
            Join Waitlist
          </button>
        </form>
      </section>

      <footer style={styles.footer}>
        <p>&copy; 2025 aggrgtr. Data aggregation for the rest of us.</p>
      </footer>
    </main>
  )
}

const styles = {
  main: {
    minHeight: '100vh',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  logo: {
    fontSize: '24px',
    fontWeight: 'bold',
    letterSpacing: '-1px',
  },
  navButton: {
    background: 'rgba(255,255,255,0.1)',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    transition: 'background 0.2s',
  },
  hero: {
    textAlign: 'center',
    padding: '80px 20px 60px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  heroTitle: {
    fontSize: 'clamp(36px, 6vw, 64px)',
    fontWeight: 'bold',
    lineHeight: '1.1',
    marginBottom: '24px',
  },
  accent: {
    background: 'linear-gradient(90deg, #00d9ff, #00ff88)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  heroSubtitle: {
    fontSize: '18px',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: '1.6',
    marginBottom: '32px',
  },
  pricing: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.6)',
  },
  price: {
    color: '#00ff88',
    fontWeight: 'bold',
    fontSize: '20px',
  },
  dataSection: {
    padding: '60px 20px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  sectionTitle: {
    fontSize: '32px',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: '40px',
  },
  dataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '20px',
  },
  dataCard: {
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.1)',
    position: 'relative',
  },
  cardIcon: {
    fontSize: '32px',
    marginBottom: '12px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  cardDesc: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: '1.5',
  },
  comingSoon: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(0,217,255,0.2)',
    color: '#00d9ff',
    fontSize: '11px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontWeight: '600',
  },
  whoSection: {
    padding: '60px 20px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  whoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
  },
  whoCard: {
    background: 'rgba(255,255,255,0.05)',
    padding: '16px',
    borderRadius: '8px',
    textAlign: 'center',
    fontSize: '14px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  waitlist: {
    padding: '80px 20px',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.2)',
  },
  waitlistText: {
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '32px',
  },
  form: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    maxWidth: '500px',
    margin: '0 auto',
  },
  input: {
    padding: '14px 20px',
    fontSize: '16px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    minWidth: '280px',
    outline: 'none',
  },
  submitButton: {
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '600',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(90deg, #00d9ff, #00ff88)',
    color: '#1a1a2e',
    cursor: 'pointer',
  },
  footer: {
    padding: '40px 20px',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '14px',
  },
}
