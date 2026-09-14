/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TypeScript (no build step) -- Next's default
  // webpack config skips transform on anything in node_modules, and pnpm
  // workspace packages land there as symlinks. Without this, the first
  // `import ... from "@roamola/db"` fails the build.
  transpilePackages: ["@roamola/db", "@roamola/core", "@roamola/analytics", "@roamola/ui"],
};

export default nextConfig;
