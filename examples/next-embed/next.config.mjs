/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@grmkris/bull-viewer-ui", "@grmkris/bull-viewer-next"],
  serverExternalPackages: ["bullmq", "ioredis"],
};
export default nextConfig;
