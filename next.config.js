/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // API route configuration - body size limit is handled in API routes via bodyParser config
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
    ];
  },
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      // Don't attempt to load these modules on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }

    // Performance optimizations for production client builds
    if (!dev && !isServer) {
      // Enable webpack cache for faster builds (only in production)
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };

      // Optimize chunks for better caching
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for node_modules
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20
            },
            // Common chunk for shared code
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true
            },
            // Leaflet and map libraries in separate chunk
            maps: {
              name: 'maps',
              test: /[\\/]node_modules[\\/](leaflet|react-leaflet)[\\/]/,
              chunks: 'all',
              priority: 30
            }
          }
        }
      };
    } else {
      // Disable cache in development to prevent ENOENT errors
      config.cache = false;
    }

    return config;
  },
};

module.exports = nextConfig;
