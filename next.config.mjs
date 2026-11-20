/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["gifenc"],
  async redirects() {
    return [
      {
        source: "/admin/shoot",
        destination: "/booth/shoot",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
