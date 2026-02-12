const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production optimizations
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Reduce bundle size
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-popover', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', 'recharts', 'framer-motion'],
  },
  // Explicitly set root directory to prevent workspace root detection issues
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Build optimizations
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Optimize client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      }
    }
    return config
  },
}

module.exports = nextConfig



