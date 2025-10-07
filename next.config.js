/** @type {import("next").NextConfig} */
module.exports = {
  // logging: {
  //   fetches: {
  //     fullUrl: true,
  //     hmrRefreshes: true,
  //   },
  // },
  experimental: {},
  images: {
    remotePatterns: [],
  },
  transpilePackages: ['next-auth']
}
