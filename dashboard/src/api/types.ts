export type CallStatus = 'GREEN' | 'YELLOW' | 'RED'

export interface Stats {
  GREEN: number
  YELLOW: number
  RED: number
}

export interface CheckResult {
  status: CallStatus
  score: number
  reason: string
  timestamp: string
  blocked: boolean
}

export interface CallLogEntry extends CheckResult {
  id: string
  caller_id: string
  destination: string
}

export interface WhitelistEntry {
  prefix: string
  label: string
  tier: string
}

export interface GreylistEntry {
  caller_id: string
  ttl_remaining_seconds: number
  added_at: string
}

export interface HealthResponse {
  status: string
  time: string
}

export type ScanSeverity = 'critical' | 'high' | 'medium'

export interface ScanFinding {
  url: string
  path: string
  status_code: number
  severity: ScanSeverity
  description: string
  content_length: number
}

export interface ScanResult {
  domain: string
  findings: ScanFinding[]
  scanned: number
  found: number
}
