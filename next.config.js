/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Suppress middleware deprecation warning (middleware is still the correct approach in Next.js 16)
  experimental: {
    // Middleware is still supported and recommended for route protection
  },
}

module.exports = nextConfig



