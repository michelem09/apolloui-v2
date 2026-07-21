/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ship a self-contained server: `next build` emits .next/standalone with only the
  // traced dependencies, so a release tarball needs neither node_modules nor a
  // build step on the device. That build is the slowest and most fragile part of
  // an update on an Apollo (minutes, with a RAM peak that can take the box down).
  //
  // Note for whoever assembles the tarball: standalone does NOT include
  // .next/static or public/ — they must be copied in next to server.js, or the
  // app serves HTML with no assets.
  output: 'standalone',
  // Pin the file-tracing/workspace root to this directory. The UI is a standalone
  // submodule with its own yarn.lock; without this, Next walks up and finds the
  // parent API's yarn.lock too ("multiple lockfiles" warning) and may pick the
  // wrong root. __dirname keeps the build self-contained with or without the parent.
  outputFileTracingRoot: __dirname,
  // LAN/localhost app: not public, not SEO. Disable next/image optimization so
  // `sharp` (and its libvips native build, painful to recompile on aarch64) is
  // never required at build or runtime. Logos/flags are tiny static assets.
  images: {
    unoptimized: true,
  },
  i18n: {
    locales: ['en', 'it', 'de', 'es'],
    defaultLocale: 'en'
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/overview',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
