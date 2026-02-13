/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/blog',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/rs-trends',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=3600' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
