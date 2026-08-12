import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  tunnelRoute: "/api/monitoring",
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
