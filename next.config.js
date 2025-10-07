/** @type {import("next").NextConfig} */
module.exports = {
  // logging: {
  //   fetches: {
  //     fullUrl: true,
  //     hmrRefreshes: true,
  //   },
  // },
  output: "output",
  experimental: {},
  images: {
    remotePatterns: [],
  },
  transpilePackages: ['next-auth']
}
