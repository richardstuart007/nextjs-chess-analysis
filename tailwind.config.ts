import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './node_modules/nextjs-shared/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontSize: {
        xxs: '0.625rem',
        xxx: '0.5rem'
      }
    }
  }
}

export default config
