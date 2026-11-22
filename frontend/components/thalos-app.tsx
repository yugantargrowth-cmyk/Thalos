"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Activity, ArrowRight, Bell, BookOpen, Bot, CheckCircle2, ChevronDown, CircleHelp, Cpu, FileText, Globe2, Layers3, Search, Settings2, ShieldCheck, Sparkles, Target, TrendingUp, X, Zap } from "lucide-react"
import { environments, initialDemoState, slugify, workspaces, type ApprovalStatus, type Environment, type OperationStatus, type TaskStatus, workspaceFromSlug } from "@/lib/thalos-data"
import { WorkspaceContent } from "@/components/workspace-content"
import { PwaInstallButton, usePwaStatus } from "@/components/pwa-runtime"

const icons = [Target, TrendingUp, Globe2, Bot, BookOpen, Settings2]
function BrandMark() { return <div className="brand-lockup"><div className="brand-symbol"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M21 3 4 36l17-9 17 9L21 3Z"/><path d="m12 29 9-18 9 18-9-5-9 5Z"/></svg></div><div><div className="brand-name">THALOS</div><div className="brand-tagline">One Intelligence. Every Device.</div></div></div> }
function RadialNavigation({ selected, onSelect }: { selected: Environment; onSelect: (e: Environment) => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const hasOpened = useRef(false)

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) setOpen(false)
    }
    window.addEventListener("keydown", close)
    if (open) {
      hasOpened.current = true
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".radial-menu.is-open .radial-node")?.focus())
    } else if (hasOpened.current) {
      triggerRef.current?.focus()
    }
    return () => window.removeEventListener("keydown", close)
  }, [open])

  return <div className="radial-anchor">
    {open && <button className="radial-scrim" tabIndex={-1} aria-label="Close environment navigation" onClick={() => setOpen(false)} />}
    <div className={`radial-menu ${open ? "is-open" : ""}`} role="dialog" aria-label="THALOS environments" aria-hidden={!open} aria-modal={open || undefined} onKeyDown={(event) => {
      if (event.key !== "Tab") return
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(".radial-node")
      const first = buttons.item(0)
      const last = buttons.item(buttons.length - 1)
      const active = event.currentTarget.ownerDocument.activeElement
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }}>
      <div className="radial-orbit orbit-one" /><div className="radial-orbit orbit-two" />
      {environments.map((environment, index) => {
        const Icon = icons[index]
        return <button key={environment.name} tabIndex={open ? 0 : -1} className={`radial-node node-${index} ${selected === environment.name ? "selected" : ""}`} onClick={() => {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12)
          onSelect(environment.name)
          setOpen(false)
        }} aria-label={`Open ${environment.name}`} aria-current={selected === environment.name ? "page" : undefined}>
          <span className="node-icon"><Icon size={18} /></span><span className="node-label">{environment.name}</span>
        </button>
      })}
    </div>
    <button ref={triggerRef} className={`command-orb ${open ? "active" : ""}`} onClick={() => setOpen((value) => !value)} aria-haspopup="dialog" aria-expanded={open} aria-label={open ? "Close environment navigation" : "Open environment navigation"}>
      <span className="orb-mark"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M21 4 5 35l16-8 16 8L21 4Z"/><path d="m13 28 8-17 8 17-8-4-8 4Z"/></svg></span><span className="orb-caption">THALOS</span>
    </button>
  </div>
}
function MobileCommandBar({ environment, workspace, offline, onNavigate }: { environment: Environment; workspace: string; offline: boolean; onNavigate: (environment: Environment, workspace?: string) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerTriggerRef = useRef<HTMLButtonElement>(null)
  const hasOpenedPicker = useRef(false)
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setPickerOpen(false)
    window.addEventListener("keydown", close)
    if (pickerOpen) {
      hasOpenedPicker.current = true
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("#mobile-workspace-picker button")?.focus())
    } else if (hasOpenedPicker.current) {
      pickerTriggerRef.current?.focus()
    }
    return () => window.removeEventListener("keydown", close)
  }, [pickerOpen])

  return <div className="mobile-command-bar">
    <div className="mobile-command-context">
      <span className={`mobile-system-indicator ${offline ? "offline" : ""}`} aria-hidden="true" />
      <span className="mobile-context-environment">{environment}</span>
      <span className="mobile-context-divider" aria-hidden="true">/</span>
      <button ref={pickerTriggerRef} className="mobile-workspace-trigger" type="button" aria-expanded={pickerOpen} aria-controls={pickerOpen ? "mobile-workspace-picker" : undefined} onClick={() => setPickerOpen((value) => !value)}>{workspace}<ChevronDown size={14} /></button>
    </div>
    <span className="mobile-connection-state">{offline ? "OFFLINE" : "LOCAL DEMO"}</span>
    {pickerOpen && <>
      <button className="workspace-picker-scrim" type="button" tabIndex={-1} aria-label="Close workspace selector" onClick={() => setPickerOpen(false)} />
      <section className="mobile-workspace-picker" id="mobile-workspace-picker" role="dialog" aria-modal="true" aria-label={`${environment} workspaces`} onKeyDown={(event) => {
        if (event.key !== "Tab") return
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([tabindex='-1'])")
        const first = buttons.item(0)
        const last = buttons.item(buttons.length - 1)
        const active = event.currentTarget.ownerDocument.activeElement
        if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
      }}>
        <div className="workspace-picker-heading"><div><span className="eyebrow">ACTIVE ENVIRONMENT</span><h2>{environment}</h2></div><button type="button" className="icon-button" aria-label="Close workspace selector" onClick={() => setPickerOpen(false)}><X size={17} /></button></div>
        <div className="workspace-picker-list">{workspaces[environment].map((page) => <button type="button" key={page} className={page === workspace ? "workspace-picker-item active" : "workspace-picker-item"} aria-current={page === workspace ? "page" : undefined} onClick={() => { onNavigate(environment, page); setPickerOpen(false) }}><span>{page}</span><ArrowRight size={15} /></button>)}</div>
      </section>
    </>}
  </div>
}

function reducer(state: typeof initialDemoState, action: { type: string; id?: string; status?: string; title?: string }){
  if (action.type === "task") return { ...state, tasks: state.tasks.map((t) => t.id === action.id ? { ...t, status: action.status as TaskStatus } : t) }
  if (action.type === "edit-task") return { ...state, tasks: state.tasks.map((t) => t.id === action.id ? { ...t, title: action.title || t.title } : t) }
  if (action.type === "create-task") { const n = state.tasks.filter((t) => t.id.startsWith("task-local-")).length + 1; return { ...state, tasks: [...state.tasks, { id: `task-local-${n}`, title: action.title || "New task", projectId: "project-northstar", agentId: "agent-operator", assignee: "You", priority: "Normal" as const, status: "Open" as const, due: "Unscheduled", description: "A locally created prototype task linked to the Northstar Studio demo project." }] } }
  if (action.type === "approval") { const approval = state.approvals.find((a) => a.id === action.id); if (!approval) return state; const status = action.status as ApprovalStatus; const approvals = state.approvals.map((a) => a.id === action.id ? { ...a, status } : a); const deals = status === "Approved" && approval.id === "approval-northstar" ? state.deals.map((d) => d.id === "deal-northstar" ? { ...d, stage: "Proposal sent" } : d) : state.deals; const tasks = status === "Approved" && approval.id === "approval-meridian" ? state.tasks.map((t) => t.id === "task-catalog" ? { ...t, status: "In progress" as const } : t) : state.tasks; const operations = status === "Approved" && approval.id === "approval-meridian" ? state.operations.map((o) => o.id === "operation-import" ? { ...o, status: "Running" as const, stage: "Catalogue mapping", error: undefined } : o) : state.operations; return { ...state, approvals, deals, tasks, operations, approvalHistory: [{ ...approval, status }, ...state.approvalHistory] } }
  if (action.type === "operation") return { ...state, operations: state.operations.map((o) => o.id === action.id ? { ...o, status: action.status as OperationStatus, stage: action.status === "Queued" ? "Queued for retry" : action.status === "Cancelled" ? "Cancelled by you" : o.stage, error: action.status === "Queued" ? undefined : o.error } : o) }
  return state
}
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  text: string
  model?: string
  intent?: string
  actions?: Array<{ tool?: string; result?: any }>
  isError?: boolean
}

function Companion({ environment, onNavigate }: { environment: Environment; onNavigate?: (env: Environment, page?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeModel, setActiveModel] = useState<string>("auto")
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = () => setOpen(true)
    window.addEventListener("open-thalos-companion", handle)
    return () => window.removeEventListener("open-thalos-companion", handle)
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  const sendQuery = async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed || loading) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text: trimmed,
    }
    setMessages((prev) => [...prev, userMsg])
    setPrompt("")
    setLoading(true)

    const chatUrl = "/api/intelligence/chat"
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${chatUrl}` : chatUrl
    console.log("[THALOS] Calling chat API URL:", fullUrl)

    try {
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.model_used) setActiveModel(data.model_used)
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: data.response || "Outcome analyzed and executed.",
            model: data.model_used,
            intent: data.intent,
            actions: data.actions_taken,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: data.error || data.message || "Failed to process request with THALOS intelligence.",
            isError: true,
          },
        ])
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: `Connection error: ${err.message || "THALOS backend unreachable"}. Make sure the backend server is running on port 3000.`,
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const suggestionChips = [
    "Check system status",
    "List pending approvals",
    "Show active AI models",
  ]

  return (
    <>
      <button
        className={`companion-tab ${open ? "companion-open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="companion-tab-icon">
          <Sparkles size={17} />
        </span>
        <span>
          Ask THALOS anything
          <span className="companion-context">
            Context · {environment} {activeModel !== "auto" ? `· ${activeModel}` : "· Live AI"}
          </span>
        </span>
        <span className="companion-shortcut">⌘ K</span>
      </button>

      {open && (
        <section className="companion-panel" aria-label="THALOS companion">
          <div className="companion-panel-head">
            <div className="companion-avatar">
              <Sparkles size={18} />
            </div>
            <div>
              <b>THALOS Companion</b>
              <span>Live AI Routing · {environment}</span>
            </div>
            {messages.length > 0 && (
              <button
                className="icon-button"
                style={{ marginRight: 6 }}
                aria-label="Clear conversation"
                title="Clear conversation"
                onClick={() => setMessages([])}
              >
                <X size={14} />
              </button>
            )}
            <button className="icon-button" aria-label="Close companion" onClick={() => setOpen(false)}>
              <X size={17} />
            </button>
          </div>

          <div className="companion-thread">
            {messages.length === 0 ? (
              <div className="companion-welcome">
                <span className="eyebrow">READY WHEN YOU ARE</span>
                <h3>What outcome are we working toward?</h3>
                <p>
                  Ask THALOS to evaluate tasks, draft proposals, or inspect system health across Gemini, Groq, and OpenAI models.
                </p>
              </div>
            ) : (
              <div className="message-group">
                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "user-message" : "assistant-message"}>
                    {m.role === "assistant" && (
                      <div className="response-type">
                        <Sparkles size={12} />
                        <span>{m.model ? m.model.toUpperCase() : "THALOS INTELLIGENCE"}</span>
                      </div>
                    )}
                    <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
                    {m.intent === "configuration_needed" && onNavigate && (
                      <div className="text-action" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="table-link"
                          style={{
                            background: "#184557",
                            color: "#6ce5ee",
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid #368294",
                            cursor: "pointer",
                            fontSize: 10,
                          }}
                          onClick={() => {
                            setOpen(false)
                            onNavigate("Execution & Settings", "Integrations")
                          }}
                        >
                          Configure API Keys in Settings →
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="assistant-message" style={{ opacity: 0.7 }}>
                    <div className="response-type">
                      <Sparkles size={12} />
                      <span>THALOS REASONING...</span>
                    </div>
                    <p>Evaluating outcome and querying active model...</p>
                  </div>
                )}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          <div className="suggestion-chips">
            {suggestionChips.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => sendQuery(chip)}
                disabled={loading}
              >
                {chip}
              </button>
            ))}
          </div>

          <form
            className="companion-compose"
            onSubmit={(e) => {
              e.preventDefault()
              sendQuery(prompt)
            }}
          >
            <input
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="Ask THALOS a question"
              placeholder="Describe an outcome or query…"
              disabled={loading}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
                  event.preventDefault()
                }
              }}
            />
            <button
              type="submit"
              className="companion-send"
              aria-label="Send prompt"
              disabled={loading || !prompt.trim()}
            >
              <ArrowRight size={16} />
            </button>
          </form>
        </section>
      )}
    </>
  )
}

export default function ThalosApp({ initialEnvironment, initialWorkspace }: { initialEnvironment?: Environment; initialWorkspace?: string }) {
  const { offline } = usePwaStatus()
  const pathname = usePathname(); const router = useRouter(); const [data, dispatch] = useReducer(reducer, initialDemoState); const [selectedRecord, setSelectedRecord] = useState<string | null>(null); const [searchOpen, setSearchOpen] = useState(false); const [notice, setNotice] = useState("")
  const segments = (pathname ?? "/").split("/").filter(Boolean); let environment = initialEnvironment ?? environments[0].name; let workspace = initialWorkspace ?? "Overview"
  if (segments.length) { const found = environments.find((e) => slugify(e.name) === segments[0]); if (found) { environment = found.name; workspace = workspaceFromSlug(environment, segments[1]) } }
  const active = environments.find((e) => e.name === environment)!; const EnvironmentIcon = icons[environments.findIndex((e) => e.name === environment)]; const navigate = (env: Environment, page = workspaces[env][0]) => router.push(`/${slugify(env)}/${slugify(page)}`)
  return <main className="app-shell"><header className="topbar"><BrandMark/><div className="topbar-center"><span className="system-dot"/><span className="system-label">THALOS CORE</span><span className="topbar-divider"/><span className="topbar-location"><Activity size={14}/>{environment}</span><span className="topbar-divider topbar-date-divider"/><span className="topbar-date">Monday, April 28 <span>·</span> 9:41 AM</span></div><div className="topbar-actions"><span className="demo-badge"><span/> DEMO DATA</span><button className="icon-button top-action" aria-label="Search workspace" onClick={() => setSearchOpen(!searchOpen)}><Search size={17}/></button><button className="icon-button top-action notification-button" aria-label="Notifications" onClick={() => setNotice(notice ? "" : "No new notifications in this demo.")}><Bell size={17}/></button><PwaInstallButton/><button className="user-avatar" aria-label="User profile" onClick={() => navigate("Execution & Settings", "Settings")}>Y</button></div>{notice && <button className="notice-popover" onClick={() => setNotice("")}>{notice}<X size={14}/></button>}</header>
    <RadialNavigation selected={environment} onSelect={(env) => navigate(env)}/>
    {searchOpen && <div className="global-search"><Search size={16}/><input autoFocus placeholder="Search workspaces, records, agents…" aria-label="Search all THALOS" onKeyDown={(e) => {
      if (e.key === "Escape") setSearchOpen(false)
      if (e.key === "Enter") {
        const val = (e.currentTarget.value || "").toLowerCase()
        if (val.includes("setting") || val.includes("key") || val.includes("integ")) {
          navigate("Execution & Settings", "Integrations")
        } else if (val.includes("model") || val.includes("ai") || val.includes("groq") || val.includes("gemini")) {
          navigate("AI Team", "Models")
        } else if (val.includes("health") || val.includes("status")) {
          navigate("Execution & Settings", "System health")
        } else if (val.includes("approval")) {
          navigate("My Day", "Approvals")
        } else if (val.includes("task")) {
          navigate("Growth & Clients", "Tasks")
        }
        setSearchOpen(false)
      }
    }}/><kbd>ESC</kbd><button onClick={() => setSearchOpen(false)} aria-label="Close search"><X size={15}/></button></div>}
    <MobileCommandBar environment={environment} workspace={workspace} offline={offline} onNavigate={navigate}/>
    <div className="main-layout"><section className="workspace-main"><div className="environment-hero"><div className="hero-orbit orbit-a"/><div className="hero-orbit orbit-b"/><div className="hero-copy"><div className="breadcrumb"><span>YUGANTAR GROWTH</span><span>/</span><span>{environment.toUpperCase()}</span></div><div className="hero-titleline"><div className="environment-icon"><EnvironmentIcon size={23}/></div><div><h1>{environment === "My Day" ? "Good morning, Boss." : environment}</h1><p>{active.description} <span>·</span> {workspace}</p></div></div></div><div className="hero-status"><span className="status-orbit"><Activity size={16}/></span><div><b>All systems considered</b><small>Prototype environment · no live services</small></div><ChevronDown size={15}/></div></div>
      <nav className="route-nav" id="workspace-nav" aria-label={`${environment} workspaces`}>{workspaces[environment].map((page) => <button key={page} aria-current={workspace === page ? "page" : undefined} className={workspace === page ? "route-tab active" : "route-tab"} onClick={() => navigate(environment, page)}>{page}</button>)}</nav>
      <WorkspaceContent environment={environment} workspace={workspace} data={data} selectedRecord={selectedRecord} onSelectRecord={setSelectedRecord} onTask={(id, status) => dispatch({ type: "task", id, status })} onEditTask={(id, title) => dispatch({ type: "edit-task", id, title })} onApproval={(id, status) => dispatch({ type: "approval", id, status })} onOperation={(id, status) => dispatch({ type: "operation", id, status })} onCreateTask={(title) => dispatch({ type: "create-task", title })} onNavigate={navigate}/>
      <footer className="workspace-footer"><span>THALOS <b>CORE</b></span><span>One Intelligence. Every Device.</span><span><CircleHelp size={13}/> Help & feedback</span></footer></section>
      <aside className="right-rail"><section className="panel rail-companion"><div className="rail-heading"><span className="eyebrow">YOUR INTELLIGENCE LAYER</span><span className="sparkle-mark"><Sparkles size={16}/></span></div><div className="rail-orbital"><div className="orbital-ring ring-a"/><div className="orbital-ring ring-b"/><div className="orbital-ring ring-c"/><div className="orbital-core"><svg viewBox="0 0 42 42" aria-hidden="true"><path d="M21 4 5 35l16-8 16 8L21 4Z"/><path d="m13 28 8-17 8 17-8-4-8 4Z"/></svg></div><span className="orbit-point point-a"><Sparkles size={14}/></span><span className="orbit-point point-b"><Cpu size={14}/></span><span className="orbit-point point-c"><Zap size={14}/></span></div><h3>Make room for the work that matters.</h3><p>Bring an outcome. THALOS can help you find the next step.</p><button className="rail-ask-button" onClick={() => window.dispatchEvent(new Event("open-thalos-companion"))}>Start a conversation <ArrowRight size={15}/></button><div className="rail-note"><span className="rail-note-dot"/>Context aware <span>·</span> {environment}</div></section>
      <section className="panel rail-ops"><div className="panel-heading"><div><span className="eyebrow">ON THE RADAR</span><h2>Worth a look</h2></div><span className="count-badge">{data.approvals.filter((a) => a.status === "Pending").length.toString().padStart(2, "0")}</span></div>{data.approvals.filter((a) => a.status === "Pending").slice(0, 2).map((a) => <button className="radar-row" key={a.id} onClick={() => navigate("My Day", "Approvals")}><span className="round-icon amber"><ShieldCheck size={15}/></span><span><b>{a.title}</b><small>{data.agents.find((agent) => agent.id === a.agentId)?.name} · {a.impact}</small></span><ArrowRight size={14}/></button>)}{data.operations.filter((o) => o.status === "Running").slice(0, 1).map((o) => <button className="radar-row" key={o.id} onClick={() => navigate("My Day", "Active operations")}><span className="round-icon cyan"><Layers3 size={15}/></span><span><b>{o.name}</b><small>{o.progress}% · {o.stage}</small></span><ArrowRight size={14}/></button>)}</section>
      <section className="panel rail-knowledge"><div className="panel-heading"><div><span className="eyebrow">MEMORY, WITH SOURCES</span><h2>Recently in context</h2></div><BookOpen size={16}/></div>{data.documents.slice(0, 2).map((d) => <button className="knowledge-row" key={d.id} onClick={() => navigate("Knowledge", "Documents")}><span className="doc-icon"><FileText size={16}/></span><span><b>{d.title}</b><small>{d.collection} · {d.source}</small></span><ArrowRight size={14}/></button>)}</section><div className="rail-environment"><span className="eyebrow">YOUR ENVIRONMENT</span><div className="env-pills">{environments.map((e, i) => { const Icon = icons[i]; return <button className={e.name === environment ? "env-pill active" : "env-pill"} key={e.name} onClick={() => navigate(e.name)}><Icon size={14}/><span>{e.name}</span></button> })}</div><div className="rail-bottom-note"><span>Local prototype</span><span>·</span><span>Nothing sent externally</span></div></div></aside></div><Companion environment={environment} onNavigate={navigate}/>
  </main>
}
