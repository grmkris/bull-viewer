/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@bull-viewer/ui", "@bull-viewer/next"],
  serverExternalPackages: ["bullmq", "ioredis"],
}
export default nextConfig
