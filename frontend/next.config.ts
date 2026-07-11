import type { NextConfig } from 'next';

// Proxy /api/* to the backend so the browser only ever talks HTTPS to this Vercel
// domain (avoids mixed-content + CORS). Set BACKEND_ORIGIN in Vercel env, e.g.
//   BACKEND_ORIGIN=http://<ec2-ip>:3000
// Then set NEXT_PUBLIC_API_BASE_URL=/api so client fetches stay same-origin.
// If BACKEND_ORIGIN is unset, no rewrite is added (app falls back to its default).
const backend = process.env.BACKEND_ORIGIN;

const nextConfig: NextConfig = {
  async rewrites() {
    if (!backend) return [];
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
