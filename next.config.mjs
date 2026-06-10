/** @type {import('next').NextConfig} */
const config = {
  transpilePackages: ['nextjs-shared'],
  env: {
    POSTGRES_URL: process.env.POSTGRES_URL
  },
  logging: {
    fetches: { fullUrl: false }
  }
}

export default config
