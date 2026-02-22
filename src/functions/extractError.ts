export interface ExtractedError {
  statusCode: number
  message: string
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) } catch { return fallback }
}

export const extractError = (error: unknown): ExtractedError => {
  const err = error as Record<string, unknown>

  if (err?.response) {
    const resp = err.response as Record<string, unknown>
    const data = resp.data as Record<string, unknown>
    return { statusCode: Number(resp.status), message: String(data?.message || '') }
  }

  let message = (err?.message as string) || String(err) || 'unknown error'

  if (message.indexOf('[') === 0 && message.indexOf(':') !== -1) {
    const splitted = message.split(':')
    splitted.shift()
    message = splitted.join(':').trim()
    if (message.charAt(message.length - 1) === '.') message = message.slice(0, -1)
    message = safeJsonParse<{ info: string }>(message, { info: message }).info
  }

  return { statusCode: 500, message }
}
