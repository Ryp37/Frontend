import type {
  Stats,
  CheckResult,
  WhitelistEntry,
  GreylistEntry,
  HealthResponse,
  ScanResult,
} from './types'

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health')
}

export function getStats(): Promise<Stats> {
  return request<Stats>(`${BASE}/stats`)
}

export function checkCall(callerID: string, destination: string): Promise<CheckResult> {
  return request<CheckResult>(`${BASE}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caller_id: callerID, destination }),
  })
}

export function getWhitelist(): Promise<WhitelistEntry[]> {
  return request<WhitelistEntry[]>(`${BASE}/whitelist`)
}

export function addWhitelistEntry(entry: {
  prefix: string
  label: string
  tier: string
}): Promise<WhitelistEntry> {
  return request<WhitelistEntry>(`${BASE}/whitelist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  })
}

export function deleteWhitelistEntry(prefix: string): Promise<void> {
  return request<void>(`${BASE}/whitelist/${encodeURIComponent(prefix)}`, {
    method: 'DELETE',
  })
}

export function getGreylist(): Promise<GreylistEntry[]> {
  return request<GreylistEntry[]>(`${BASE}/greylist`)
}

export function deleteGreylistEntry(callerID: string): Promise<void> {
  return request<void>(`${BASE}/greylist/${encodeURIComponent(callerID)}`, {
    method: 'DELETE',
  })
}

export function scanDomain(domain: string): Promise<ScanResult> {
  return request<ScanResult>(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain }),
  })
}
