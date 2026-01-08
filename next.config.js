const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Suppress middleware deprecation warning (middleware is still the correct approach in Next.js 16)
  experimental: {
    // Middleware is still supported and recommended for route protection
  },
  // Explicitly set root directory to prevent workspace root detection issues
  turbopack: {
    root: path.resolve(__dirname),
  },
}

module.exports = nextConfig



