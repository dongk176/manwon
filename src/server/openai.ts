import { readFileSync } from 'fs'

const sharedEnvPath = process.env.OPENAI_SHARED_ENV_FILE || '/Users/gimdongmin/couple_judgment_mvp/.env'

let sharedEnvCache: Record<string, string> | null = null

function parseEnvFile(contents: string) {
  const values: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex < 1) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

export function getOpenAiApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    sharedEnvCache ??= parseEnvFile(readFileSync(/* turbopackIgnore: true */ sharedEnvPath, 'utf8'))
    return sharedEnvCache.OPENAI_API_KEY
  } catch {
    return undefined
  }
}
