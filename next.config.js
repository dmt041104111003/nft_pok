/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Enable WebAssembly for Lucid Evolution (CML browser WASM)
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
    }
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }
    return config
  },
}

module.exports = nextConfig
