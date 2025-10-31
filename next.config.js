/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Enable standalone output for Docker deployment
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't attempt to load these modules on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        sqlite3: false,
        'better-sqlite3': false
      };
    }
    // Disable webpack cache to prevent ENOENT errors
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;