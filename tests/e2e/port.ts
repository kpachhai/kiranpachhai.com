export const DEFAULT_E2E_PORT = 4329

// Reads E2E_PORT. Unset uses the default quietly; an empty, non-numeric or out-of-range
// value also falls back to the default, with a warning, instead of a 60 s webServer timeout.
export function e2ePort(raw: string | undefined, warn: (message: string) => void = console.warn): number {
  if (raw === undefined) return DEFAULT_E2E_PORT
  const port = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN
  if (Number.isInteger(port) && port > 0 && port < 65536) return port
  warn(`E2E_PORT=${JSON.stringify(raw)} is not a port number; using ${DEFAULT_E2E_PORT}.`)
  return DEFAULT_E2E_PORT
}
