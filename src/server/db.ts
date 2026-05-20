import postgres from 'postgres'
import { getDatabaseUrl } from '@/server/env'

let sqlClient: ReturnType<typeof postgres> | null = null

export function getSql() {
  if (!sqlClient) {
    sqlClient = postgres(getDatabaseUrl(), {
      max: 4,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      transform: postgres.camel,
    })
  }

  return sqlClient
}

export async function closeSqlForScripts() {
  if (sqlClient) {
    await sqlClient.end({ timeout: 5 })
    sqlClient = null
  }
}
