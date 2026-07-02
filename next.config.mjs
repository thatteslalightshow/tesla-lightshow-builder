import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // instrumentation.ts is stable since Next 15 — the experimental.instrumentationHook flag is gone.
  // Turbopack is the Next 16 default, but this webpack config (and the Sentry wrapper) still needs
  // webpack — `next build --webpack` in package.json opts out. Turbopack migration is a follow-up.
  webpack: (config) => {
    // The server-side WASM MP3 decoder (mpg123-decoder → @wasm-audio-decoders → @eshaz/web-worker)
    // loads its worker through a dynamic require() that webpack can't statically analyze, producing a
    // benign "Critical dependency: the request of a dependency is an expression" warning. It's used only
    // in api/export (BYOM server fallback) and works fine — silence just this module so the build stops
    // reporting "Compiled with warnings" and a genuine warning can't hide in the noise.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@eshaz[\\/]web-worker/ },
    ];
    return config;
  },
};

// Wrap with Sentry. With no org/project/authToken, source-map upload is skipped
// (no build failure); runtime error capture still works once the DSN is set.
export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },   // was disableLogger (deprecated in v10)
  // Upload source maps to Sentry (for readable stack traces) but DELETE them from the deployed bundle
  // afterward, so we never serve our original source to end users. No-op when upload is skipped.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
