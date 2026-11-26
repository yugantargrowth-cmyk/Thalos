/**
 * THALOS Canonical API Client
 * Connects Frontend directly to Express backend with JWT Bearer authentication.
 */

const TOKEN_KEY = "thalos_token"

export interface AuthState {
  token: string | null
  authenticated: boolean
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(TOKEN_KEY, token)
    document.cookie = `thalos_token=${token}; path=/; max-age=604800; SameSite=Lax`
  } catch (e) {
    console.warn("Failed to set auth token:", e)
  }
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(TOKEN_KEY)
    document.cookie = "thalos_token=; path=/; max-age=0"
  } catch (e) {
    console.warn("Failed to clear auth token:", e)
  }
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(options.headers || {})

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const res = await fetch(path, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    // Dispatch auth required event so UI can prompt for PIN if needed
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("thalos_auth_required"))
    }
  }

  if (!res.ok) {
    let errMessage = `HTTP ${res.status}: ${res.statusText}`
    try {
      const errJson = await res.json()
      errMessage = errJson.error || errJson.message || JSON.stringify(errJson)
    } catch {
      // Keep default
    }
    const error = new Error(errMessage)
    ;(error as any).status = res.status
    throw error
  }

  // Handle empty or attachment responses
  const contentType = res.headers.get("content-type")
  if (contentType && contentType.includes("application/json")) {
    return res.json()
  }
  return res.text() as unknown as T
}

// ── Auth APIs ─────────────────────────────────────────────────────────────

export async function loginWithPin(pin: string): Promise<{ token: string; expires_in: number }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  })
  if (!res.ok) {
    let msg = "Invalid PIN"
    try {
      const j = await res.json()
      msg = j.error || msg
    } catch {}
    throw new Error(msg)
  }
  const data = await res.json()
  if (data.token) {
    setStoredToken(data.token)
  }
  return data
}

// ── Intelligence / Chat ───────────────────────────────────────────────────

export interface ChatPayload {
  message: string
  session_date?: string
  model?: string
  provider?: string
}

export interface ChatResponse {
  conversation_id?: string
  message_id?: string
  user_message_id?: string
  response: string
  intent?: string
  action_status?: 'none' | 'plan' | 'pending_approval' | 'attempted' | 'completed' | 'clarification_needed'
  actions_taken?: Array<string | { tool?: string; result?: any }>
  pending_approvals?: any[]
  model_used?: string
  tokens_used?: number
  session_date?: string
}

export async function chatWithThalos(payload: ChatPayload): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/intelligence/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function clearConversation(date?: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(
    date ? `/api/intelligence/conversations/${date}` : "/api/intelligence/conversations",
    { method: "DELETE" }
  )
}

export async function getDailyBrief(): Promise<{ brief: string; generated_at: string; items: any[] }> {
  return apiFetch("/api/intelligence/brief")
}

// ── Leads CRM ─────────────────────────────────────────────────────────────

export async function fetchBackendLeads(stage?: string): Promise<{ leads: any[]; total: number }> {
  const q = stage ? `?stage=${encodeURIComponent(stage)}` : ""
  return apiFetch(`/api/leads${q}`)
}

export async function createBackendLead(lead: any): Promise<{ lead: any }> {
  return apiFetch("/api/leads", {
    method: "POST",
    body: JSON.stringify(lead),
  })
}

export async function updateBackendLead(id: string, updates: any): Promise<{ lead: any }> {
  return apiFetch(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  })
}

export async function triageBackendLead(id: string): Promise<{ triage: any }> {
  return apiFetch(`/api/leads/${id}/triage`, {
    method: "POST",
  })
}

export async function enrichBackendLead(id: string): Promise<{ enrichment: any }> {
  return apiFetch(`/api/leads/${id}/enrich`)
}

export async function getBackendPipelineReport(): Promise<{ report: any }> {
  return apiFetch("/api/leads/report")
}

// ── Clients ───────────────────────────────────────────────────────────────

export async function fetchBackendClients(status?: string): Promise<{ clients: any[]; total: number }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ""
  return apiFetch(`/api/clients${q}`)
}

export async function createBackendClient(client: any): Promise<{ client: any }> {
  return apiFetch("/api/clients", {
    method: "POST",
    body: JSON.stringify(client),
  })
}

export async function updateBackendClient(id: string, updates: any): Promise<{ client: any }> {
  return apiFetch(`/api/clients/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  })
}

// ── Approvals ─────────────────────────────────────────────────────────────

export async function fetchBackendApprovals(status = "pending"): Promise<{ approvals: any[]; total: number }> {
  return apiFetch(`/api/approvals?status=${encodeURIComponent(status)}`)
}

export async function approveBackendAction(id: string, executeImmediately = true): Promise<{ approval: any; execution?: any }> {
  return apiFetch(`/api/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ execute_immediately: executeImmediately }),
  })
}

export async function rejectBackendAction(id: string, reason = "Rejected by founder"): Promise<{ approval: any }> {
  return apiFetch(`/api/approvals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
}

// ── Finance ───────────────────────────────────────────────────────────────

export async function fetchBackendInvoices(): Promise<{ invoices: any[]; total: number }> {
  return apiFetch("/api/finance/invoices")
}

export async function createBackendInvoice(invoice: any): Promise<{ invoice: any }> {
  return apiFetch("/api/finance/invoices", {
    method: "POST",
    body: JSON.stringify(invoice),
  })
}

export async function fetchBackendProposals(): Promise<{ proposals: any[]; total: number }> {
  return apiFetch("/api/finance/proposals")
}

export async function verifyBackendUtr(invoiceId: string, utr: string): Promise<{ verified: boolean; message: string }> {
  return apiFetch(`/api/finance/invoices/${invoiceId}/verify-utr`, {
    method: "POST",
    body: JSON.stringify({ utr_number: utr }),
  })
}

export async function getBackendFinanceSummary(): Promise<any> {
  return apiFetch("/api/finance/summary")
}

// ── Knowledge & RAG ───────────────────────────────────────────────────────

export async function fetchBackendDocuments(category?: string): Promise<{ documents: any[]; total: number }> {
  const q = category ? `?category=${encodeURIComponent(category)}` : ""
  return apiFetch(`/api/knowledge${q}`)
}

export async function uploadBackendDocument(file: File, category = "general", tags = ""): Promise<{ document: any }> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("category", category)
  if (tags) formData.append("tags", tags)

  return apiFetch("/api/knowledge/documents", {
    method: "POST",
    body: formData,
  })
}

export async function searchBackendKnowledge(query: string, matchCount = 5): Promise<{ results: any[] }> {
  return apiFetch("/api/knowledge/search", {
    method: "POST",
    body: JSON.stringify({ query, limit: matchCount }),
  })
}

// ── Integrations ──────────────────────────────────────────────────────────

export async function fetchIntegrationsStatus(): Promise<any> {
  return apiFetch("/api/integrations/status")
}

export async function fetchModelsCatalogue(): Promise<any> {
  return apiFetch("/api/integrations/models")
}

export async function testBackendIntegration(provider: string): Promise<{ success: boolean; message: string; latency_ms?: number }> {
  return apiFetch(`/api/integrations/${provider}/test`, {
    method: "POST",
  })
}

export async function saveBackendSettings(settings: any): Promise<{ success: boolean; message: string }> {
  return apiFetch("/api/integrations/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  })
}

// ── System Health & Telemetry ─────────────────────────────────────────────

export async function checkBackendReady(): Promise<{ status: string; checks: Record<string, string>; timestamp: string }> {
  return apiFetch("/health/ready")
}

export async function fetchBackendHealth(): Promise<any> {
  return apiFetch("/api/system/health")
}

export async function fetchBackendQueue(): Promise<{ queue: any }> {
  return apiFetch("/api/system/queue")
}

export async function fetchBackendAgents(): Promise<{ agents: any[] }> {
  return apiFetch("/api/system/agents")
}

export async function fetchBackendTools(): Promise<{ tools: any[] }> {
  return apiFetch("/api/system/tools")
}

export async function fetchBackendAudit(limit = 50): Promise<{ events: any[]; total: number }> {
  return apiFetch(`/api/system/audit?limit=${limit}`)
}
