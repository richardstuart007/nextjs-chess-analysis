import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

// Load .env file
config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function migrate() {
  const connectionString = process.env.POSTGRES_URL
  if (!connectionString) {
    console.error('POSTGRES_URL environment variable is not set.')
    console.error('Copy .env.example to .env and configure your database connection.')
    process.exit(1)
  }

  const client = new Client({ connectionString })

  try {
    await client.connect()
    console.log('Connected to database.')

    const schemaPath = path.join(__dirname, 'schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf-8')

    if (schema.trim().split('\n').every(line => line.startsWith('--') || line.trim() === '')) {
      console.log('Schema file contains only comments. Nothing to migrate.')
      return
    }

    await client.query(schema)
    console.log('Migration completed successfully.')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

migrate()
