/** @type {import("next").NextConfig} */
module.exports = {
  // logging: {
  //   fetches: {
  //     fullUrl: true,
  //     hmrRefreshes: true,
  //   },
  // },
  output: "export",
  experimental: {},
  images: {
    remotePatterns: [],
  },
  transpilePackages: ['next-auth']
}
