/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/inbox',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
