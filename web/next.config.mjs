export default {
  poweredByHeader: false,
  // The browser talks to /api on this site; Vercel forwards it to the API server (API_ORIGIN, e.g. https://notebook-api.hamish555.com).
  // That way the browser never needs CORS or the API's own address.
  async rewrites() {
    const origin = (process.env.API_ORIGIN || '').replace(/\/+$/, '')
    return origin ? [{ source: '/api/:path*', destination: `${origin}/:path*` }] : []
  },
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }, { source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
    ] }]
  },
}
