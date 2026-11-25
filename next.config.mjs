/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  async redirects() {
    return [
      {
        source: '/inbox',
        destination: '/',
        permanent: false,
      },
      {
        source: '/accounts',
        destination: '/',
        permanent: false,
      },
      {
        source: '/budget',
        destination: '/',
        permanent: false,
      },
      {
        source: '/supports',
        destination: '/',
        permanent: false,
      },
      {
        source: '/rekap',
        destination: '/',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
