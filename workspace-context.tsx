'use client'

import { useState, useEffect } from 'react'

type Environment = 'my-day' | 'revenue' | 'digital-world' | 'ai-team' | 'knowledge' | 'settings'

// ── API fetch helper ───────────────────────────────────────────────
async function apiFetch(path: string, options?: RequestInit) {
  const token = localStorage.getItem('thalos_token')
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options?.headers || {})
    }
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Loading skeleton ───────────────────────────────────────────────
function Skeleton() {
  return <div className="h-4 bg-white/5 rounded animate-pulse w-full" />
}

// ── MY DAY ─────────────────────────────────────────────────────────
function MyDay() {
  const [leads, setLeads] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/api/leads?limit=5'),
      apiFetch('/api/clients')
    ]).then(([l, c]) => {
      setLeads(l)
      setClients(c)
    }).finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const activeClients = clients.filter(c => c.status === 'active').length
  const newLeads = leads.filter(l => l.status === 'new').length
  const totalPipeline = leads.reduce((s, l) => s + (Number(l.value) || 0), 0)

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      <div>
        <div className="text-xl font-semibold">{greeting}, Boss.</div>
        <div className="text-white/40 text-sm mt-1">
          {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton /><Skeleton /><Skeleton /></div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Active Clients', value: activeClients },
              { label: 'New Leads', value: newLeads },
              { label: 'Pipeline', value: `₹${(totalPipeline/1000).toFixed(0)}k` }
            ].map(s => (
              <div key={s.label} className="bg-white/5 rounded-2xl p-4 border border-white/8">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-white/40 text-xs mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Recent leads */}
          {leads.length > 0 && (
            <div>
              <div className="text-xs text-white/40 uppercase tracking-widest mb-3">Recent Leads</div>
              <div className="space-y-2">
                {leads.slice(0, 4).map(lead => (
                  <div key={lead.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/8">
                    <div>
                      <div className="text-sm font-medium">{lead.name}</div>
                      <div className="text-white/40 text-xs">{lead.company || '—'}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {lead.value > 0 && (
                        <div className="text-xs text-white/60">₹{Number(lead.value).toLocaleString('en-IN')}</div>
                      )}
                      <div className={`text-xs px-2 py-0.5 rounded-full ${
                        lead.status === 'new' ? 'bg-blue-500/20 text-blue-300' :
                        lead.status === 'qualified' ? 'bg-green-500/20 text-green-300' :
                        lead.status === 'proposal' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-white/10 text-white/50'
                      }`}>
                        {lead.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {leads.length === 0 && clients.length === 0 && (
            <div className="text-center py-12">
              <div className="text-white/20 text-sm">No data yet.</div>
              <div className="text-white/15 text-xs mt-1">Ask THALOS to add your first lead.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── REVENUE ────────────────────────────────────────────────────────
function Revenue() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/clients')
      .then(setClients)
      .finally(() => setLoading(false))
  }, [])

  const totalMRR = clients
    .filter(c => c.status === 'active')
    .reduce((s, c) => s + (Number(c.monthly_value) || 0), 0)

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      <div className="text-sm font-semibold text-white/60 uppercase tracking-widest">Revenue</div>

      {loading ? (
        <div className="space-y-3"><Skeleton /><Skeleton /></div>
      ) : (
        <>
          <div className="bg-white/5 rounded-2xl p-5 border border-white/8">
            <div className="text-white/40 text-xs uppercase tracking-widest mb-1">Monthly Recurring</div>
            <div className="text-3xl font-bold">₹{totalMRR.toLocaleString('en-IN')}</div>
            <div className="text-white/30 text-xs mt-1">{clients.filter(c => c.status === 'active').length} active clients</div>
          </div>

          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest mb-3">Clients</div>
            <div className="space-y-2">
              {clients.map(client => (
                <div key={client.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/8">
                  <div>
                    <div className="text-sm font-medium">{client.name}</div>
                    <div className="text-white/40 text-xs">{client.services?.join(', ') || '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">₹{Number(client.monthly_value).toLocaleString('en-IN')}/mo</div>
                    <div className={`text-xs ${client.status === 'active' ? 'text-green-400' : 'text-white/30'}`}>
                      {client.status}
                    </div>
                  </div>
                </div>
              ))}
              {clients.length === 0 && (
                <div className="text-center py-8 text-white/20 text-sm">No clients yet. Add via THALOS chat.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── AI TEAM ────────────────────────────────────────────────────────
function AITeam() {
  const agents = [
    { name: 'THALOS', role: 'Orchestrator', status: 'online', icon: '⚡', desc: 'Intent → Plan → Delegate' },
    { name: 'Researcher', role: 'Lead Intelligence', status: 'ready', icon: '🔍', desc: 'Digital audit, source review' },
    { name: 'Hunter', role: 'Outreach', status: 'ready', icon: '🎯', desc: 'WhatsApp & email drafts' },
    { name: 'DeckBuilder', role: 'Documents', status: 'ready', icon: '📄', desc: 'Proposals & pitch decks' }
  ]

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      <div className="text-sm font-semibold text-white/60 uppercase tracking-widest">AI Team</div>
      <div className="space-y-3">
        {agents.map(agent => (
          <div key={agent.name} className="bg-white/5 rounded-2xl p-4 border border-white/8">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{agent.icon}</div>
                <div>
                  <div className="font-semibold text-sm">{agent.name}</div>
                  <div className="text-white/40 text-xs">{agent.role}</div>
                </div>
              </div>
              <div className={`text-xs px-2 py-0.5 rounded-full ${
                agent.status === 'online' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/40'
              }`}>
                {agent.status}
              </div>
            </div>
            <div className="text-white/30 text-xs mt-3">{agent.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── KNOWLEDGE ──────────────────────────────────────────────────────
function Knowledge() {
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', content: '', category: 'general' })

  useEffect(() => {
    apiFetch('/api/knowledge')
      .then(setDocs)
      .finally(() => setLoading(false))
  }, [])

  const addDoc = async () => {
    if (!form.title || !form.content) return
    setLoading(true)
    await apiFetch('/api/knowledge', {
      method: 'POST',
      body: JSON.stringify(form)
    })
    setForm({ title: '', content: '', category: 'general' })
    setAdding(false)
    const updated = await apiFetch('/api/knowledge')
    setDocs(updated)
    setLoading(false)
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white/60 uppercase tracking-widest">Knowledge</div>
        <button
          onClick={() => setAdding(a => !a)}
          className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/60 hover:text-white transition-all"
        >
          + Add
        </button>
      </div>

      {adding && (
        <div className="bg-white/5 rounded-2xl p-4 border border-white/15 space-y-3">
          <input
            placeholder="Title"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 outline-none"
          />
          <textarea
            placeholder="Content (paste doc text, brief, notes...)"
            value={form.content}
            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 outline-none resize-none"
          />
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full bg-white/8 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none"
          >
            {['general', 'client', 'brand', 'finance', 'process', 'strategy'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={addDoc}
            className="w-full py-2 bg-white text-[#07111b] rounded-xl text-sm font-semibold"
          >
            Ingest into THALOS
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3"><Skeleton /><Skeleton /></div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <div key={doc.id} className="bg-white/5 rounded-xl px-4 py-3 border border-white/8">
              <div className="text-sm font-medium">{doc.title}</div>
              <div className="text-white/30 text-xs mt-1 capitalize">{doc.category} · {new Date(doc.created_at).toLocaleDateString()}</div>
            </div>
          ))}
          {docs.length === 0 && (
            <div className="text-center py-8 text-white/20 text-sm">
              No knowledge ingested yet. Add docs above.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SETTINGS ───────────────────────────────────────────────────────
function Settings() {
  const sections = [
    {
      title: 'AI Engine',
      items: [
        { label: 'Primary Model', value: 'Groq · LLaMA 3.3 70B' },
        { label: 'STT', value: 'Groq Whisper Large v3' },
        { label: 'TTS', value: 'ElevenLabs Turbo v2' },
        { label: 'Fallback', value: 'Gemini (Phase 3)' }
      ]
    },
    {
      title: 'Database',
      items: [
        { label: 'Provider', value: 'Supabase PostgreSQL' },
        { label: 'RAG', value: 'Hybrid FTS + pgvector' }
      ]
    },
    {
      title: 'Deployment',
      items: [
        { label: 'Frontend', value: 'Vercel (thalos-eosin.vercel.app)' },
        { label: 'Backend', value: 'Vercel Serverless Functions' },
        { label: 'Auth', value: 'Single PIN · Session-based' }
      ]
    }
  ]

  const handleLogout = () => {
    localStorage.removeItem('thalos_token')
    window.location.reload()
  }

  return (
    <div className="p-5 space-y-6 overflow-y-auto h-full">
      <div className="text-sm font-semibold text-white/60 uppercase tracking-widest">Settings</div>

      {sections.map(section => (
        <div key={section.title}>
          <div className="text-xs text-white/30 uppercase tracking-widest mb-2">{section.title}</div>
          <div className="bg-white/5 rounded-2xl border border-white/8 overflow-hidden">
            {section.items.map((item, i) => (
              <div key={item.label} className={`flex items-center justify-between px-4 py-3 ${
                i < section.items.length - 1 ? 'border-b border-white/5' : ''
              }`}>
                <div className="text-sm text-white/60">{item.label}</div>
                <div className="text-sm text-white/90 text-right max-w-[55%]">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-2xl border border-red-500/30 text-red-400 text-sm font-medium active:scale-95 transition-all"
      >
        Sign Out
      </button>

      <div className="text-center text-white/15 text-xs pb-4">
        THALOS v1.0 · Yugantar Growth · Owner only
      </div>
    </div>
  )
}

// ── Digital World placeholder ──────────────────────────────────────
function DigitalWorld() {
  return (
    <div className="p-5 flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-2xl mb-3">🌐</div>
        <div className="text-white/40 text-sm">Digital World</div>
        <div className="text-white/20 text-xs mt-1">Lead research & web audit — Phase 2</div>
      </div>
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────
export function WorkspaceContent({ environment }: { environment: Environment }) {
  const components: Record<Environment, JSX.Element> = {
    'my-day': <MyDay />,
    'revenue': <Revenue />,
    'digital-world': <DigitalWorld />,
    'ai-team': <AITeam />,
    'knowledge': <Knowledge />,
    'settings': <Settings />
  }

  return components[environment] || <MyDay />
}

