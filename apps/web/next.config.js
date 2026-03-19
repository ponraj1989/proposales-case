/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@proposales/ui', '@proposales/api-client', '@proposales/ai', '@proposales/theme'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.proposales.com https://ai-gateway.vercel.sh https://va.vercel-scripts.com https://accounts.google.com; frame-src https://accounts.google.com;",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
