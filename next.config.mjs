import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { instrumentationHook: true },
};

// Wrap with Sentry. With no org/project/authToken, source-map upload is skipped
// (no build failure); runtime error capture still works once the DSN is set.
export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
});
