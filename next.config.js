/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-leaflet 4.x is not compatible with React 18 StrictMode's dev-only
  // double mount/unmount, which throws "Map container is already initialized".
  // StrictMode double-invocation does not run in production builds, so this only
  // affects the dev experience; disable it so the Leaflet maps mount cleanly.
  reactStrictMode: false,
  eslint: {
    // Enable ESLint during builds to catch issues early
    ignoreDuringBuilds: false,
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
          },
          // Content-Security-Policy is set dynamically (with a per-request nonce)
          // in middleware.ts. It is intentionally omitted from the static header
          // list here so the middleware value takes precedence.
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

      // Next.js already splits chunks per route with a shared framework chunk. The
      // override that used to live here forced ALL of node_modules into one `vendor`
      // cacheGroup with chunks:'all' and disabled Next's own default/vendors groups, so
      // every route paid for every dependency: /login shipped 834 kB First Load for 1.38 kB
      // of its own code, and the full ECharts build reached routes with no charts.
    } else {
      // Disable cache in development to prevent ENOENT errors
      config.cache = false;
    }

    return config;
  },
};

module.exports = nextConfig;
