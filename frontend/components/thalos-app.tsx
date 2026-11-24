"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Activity, ArrowRight, Bell, BookOpen, Bot, CheckCircle2, ChevronDown, CircleHelp,
  Cpu, FileText, Globe2, Layers3, Mic, MicOff, RefreshCw, Search, Settings2,
  ShieldCheck, Sparkles, Target, Trash2, TrendingUp, Volume2, VolumeX, X, Zap
} from "lucide-react"
import {
  environments, initialDemoState, EMPTY_LIVE_STATE, loadSavedState, saveSavedState,
  resetToCleanState, resetToDemoState, slugify, workspaces,
  type ApprovalStatus, type DemoState, type Environment, type OperationStatus, type TaskStatus, workspaceFromSlug
} from "@/lib/thalos-data"
import { WorkspaceContent } from "@/components/workspace-content"
import { PwaInstallButton, usePwaStatus } from "@/components/pwa-runtime"
import { getStoredVoiceSettings, saveVoiceSettings, speakResponse, stopSpeaking, createSpeechRecognizer, type VoiceSettings } from "@/lib/voice"

const icons = [Target, TrendingUp, Globe2, Bot, BookOpen, Settings2]

function BrandMark() {
  return (
    <div className="brand-lockup">
      <div className="brand-symbol">
        <svg viewBox="0 0 42 42" aria-hidden="true">
          <path d="M21 3 4 36l17-9 17 9L21 3Z"/>
          <path d="m12 29 9-18 9 18-9-5-9 5Z"/>
        </svg>
      </div>
      <div>
        <div className="brand-name">THALOS</div>
        <div className="brand-tagline">One Intelligence. Every Device.</div>
      </div>
    </div>
  )
}

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

  return (
    <div className="radial-anchor">
      {open && <button className="radial-scrim" tabIndex={-1} aria-label="Close environment navigation" onClick={() => setOpen(false)} />}
      <div
        className={`radial-menu ${open ? "is-open" : ""}`}
        role="dialog"
        aria-label="THALOS environments"
        aria-hidden={!open}
        aria-modal={open || undefined}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(".radial-node")
          const first = buttons.item(0)
          const last = buttons.item(buttons.length - 1)
          const active = event.currentTarget.ownerDocument.activeElement
          if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
        }}
      >
        <div className="radial-orbit orbit-one" /><div className="radial-orbit orbit-two" />
        {environments.map((environment, index) => {
          const Icon = icons[index]
          return (
            <button
              key={environment.name}
              tabIndex={open ? 0 : -1}
              className={`radial-node node-${index} ${selected === environment.name ? "selected" : ""}`}
              onClick={() => {
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12)
                onSelect(environment.name)
                setOpen(false)
              }}
              aria-label={`Open ${environment.name}`}
              aria-current={selected === environment.name ? "page" : undefined}
            >
              <span className="node-icon"><Icon size={18} /></span>
              <span className="node-label">{environment.name}</span>
            </button>
          )
        })}
      </div>
      <button
        ref={triggerRef}
        className={`command-orb ${open ? "active" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={open ? "Close environment navigation" : "Open environment navigation"}
      >
        <span className="orb-mark">
          <svg viewBox="0 0 42 42" aria-hidden="true">
            <path d="M21 4 5 35l16-8 16 8L21 4Z"/>
            <path d="m13 28 8-17 8 17-8-4-8 4Z"/>
          </svg>
        </span>
        <span className="orb-caption">THALOS</span>
      </button>
    </div>
  )
}

function MobileCommandBar({
  environment, workspace, offline, onNavigate
}: {
  environment: Environment; workspace: string; offline: boolean; onNavigate: (environment: Environment, workspace?: string) => void
}) {
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

  return (
    <div className="mobile-command-bar">
      <div className="mobile-command-context">
        <span className={`mobile-system-indicator ${offline ? "offline" : ""}`} aria-hidden="true" />
        <span className="mobile-context-environment">{environment}</span>
        <span className="mobile-context-divider" aria-hidden="true">/</span>
        <button
          ref={pickerTriggerRef}
          className="mobile-workspace-trigger"
          type="button"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? "mobile-workspace-picker" : undefined}
          onClick={() => setPickerOpen((value) => !value)}
        >
          {workspace}<ChevronDown size={14} />
        </button>
      </div>
      <span className="mobile-connection-state">{offline ? "OFFLINE" : "LIVE STATE"}</span>
      {pickerOpen && (
        <>
          <button className="workspace-picker-scrim" type="button" tabIndex={-1} aria-label="Close workspace selector" onClick={() => setPickerOpen(false)} />
          <section className="mobile-workspace-picker" id="mobile-workspace-picker" role="dialog" aria-modal="true" aria-label={`${environment} workspaces`}>
            <div className="workspace-picker-heading">
              <div><span className="eyebrow">ACTIVE ENVIRONMENT</span><h2>{environment}</h2></div>
              <button type="button" className="icon-button" aria-label="Close workspace selector" onClick={() => setPickerOpen(false)}><X size={17} /></button>
            </div>
            <div className="workspace-picker-list">
              {workspaces[environment].map((page) => (
                <button
                  type="button"
                  key={page}
                  className={page === workspace ? "workspace-picker-item active" : "workspace-picker-item"}
                  aria-current={page === workspace ? "page" : undefined}
                  onClick={() => { onNavigate(environment, page); setPickerOpen(false) }}
                >
                  <span>{page}</span><ArrowRight size={15} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function reducer(state: DemoState, action: any): DemoState {
  if (action.type === "reset-clean") {
    return resetToCleanState()
  }
  if (action.type === "reset-demo") {
    return resetToDemoState()
  }
  if (action.type === "import-leads") {
    const updated = { ...state, leads: [...action.leads, ...state.leads] }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "create-lead") {
    const updated = { ...state, leads: [action.lead, ...state.leads] }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "update-lead") {
    const updated = {
      ...state,
      leads: state.leads.map((l) => (l.id === action.id ? { ...l, ...action.updates } : l)),
    }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "update-invoice") {
    const updated = {
      ...state,
      invoices: state.invoices.map((inv) => (inv.id === action.id ? { ...inv, ...action.updates } : inv)),
    }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "task") {
    const updated = { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, status: action.status as TaskStatus } : t)) }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "edit-task") {
    const updated = { ...state, tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, title: action.title || t.title } : t)) }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "create-task") {
    const n = state.tasks.filter((t) => t.id.startsWith("task-local-")).length + 1
    const newTask = {
      id: `task-local-${Date.now()}-${n}`,
      title: action.title || "New task",
      projectId: state.projects[0]?.id || "project-local",
      agentId: "agent-operator",
      assignee: "You",
      priority: "Normal" as const,
      status: "Open" as const,
      due: "Today",
      description: "A business task created in your active workspace.",
    }
    const updated = { ...state, tasks: [newTask, ...state.tasks] }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "approval") {
    const approval = state.approvals.find((a) => a.id === action.id)
    if (!approval) return state
    const status = action.status as ApprovalStatus
    const approvals = state.approvals.map((a) => (a.id === action.id ? { ...a, status } : a))
    const deals = status === "Approved" && approval.id === "approval-northstar" ? state.deals.map((d) => d.id === "deal-northstar" ? { ...d, stage: "Proposal sent" } : d) : state.deals
    const tasks = status === "Approved" && approval.id === "approval-meridian" ? state.tasks.map((t) => t.id === "task-catalog" ? { ...t, status: "In progress" as const } : t) : state.tasks
    const operations = status === "Approved" && approval.id === "approval-meridian" ? state.operations.map((o) => o.id === "operation-import" ? { ...o, status: "Running" as const, stage: "Catalogue mapping", error: undefined } : o) : state.operations
    const updated = { ...state, approvals, deals, tasks, operations, approvalHistory: [{ ...approval, status }, ...state.approvalHistory] }
    saveSavedState(updated)
    return updated
  }
  if (action.type === "operation") {
    const updated = {
      ...state,
      operations: state.operations.map((o) =>
        o.id === action.id
          ? {
              ...o,
              status: action.status as OperationStatus,
              stage: action.status === "Queued" ? "Queued for retry" : action.status === "Cancelled" ? "Cancelled by you" : o.stage,
              error: action.status === "Queued" ? undefined : o.error,
            }
          : o
      ),
    }
    saveSavedState(updated)
    return updated
  }
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

function Companion({
  environment,
  workspace,
  data,
  dispatch,
  setSelectedRecord,
  onNavigate,
}: {
  environment: Environment
  workspace: string
  data: DemoState
  dispatch: React.Dispatch<any>
  setSelectedRecord: (id: string | null) => void
  onNavigate: (env: Environment, page?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [activeModel, setActiveModel] = useState<string>("auto")
  const threadEndRef = useRef<HTMLDivElement>(null)

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => getStoredVoiceSettings())
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState("")
  const recognizerRef = useRef<any>(null)

  useEffect(() => {
    const handleVoiceUpdate = (e: any) => {
      if (e.detail) setVoiceSettings(e.detail)
    }
    window.addEventListener("thalos_voice_settings_changed", handleVoiceUpdate)
    return () => window.removeEventListener("thalos_voice_settings_changed", handleVoiceUpdate)
  }, [])

  useEffect(() => {
    const handle = () => setOpen(true)
    window.addEventListener("open-thalos-companion", handle)
    return () => window.removeEventListener("open-thalos-companion", handle)
  }, [])

  useEffect(() => {
    const handleVoiceTrigger = () => {
      setOpen(true)
      toggleListening()
    }
    window.addEventListener("trigger-thalos-voice", handleVoiceTrigger)
    return () => window.removeEventListener("trigger-thalos-voice", handleVoiceTrigger)
  }, [isListening])

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

  const toggleListening = () => {
    if (isListening) {
      if (recognizerRef.current) {
        try { recognizerRef.current.stop() } catch {}
        recognizerRef.current = null
      }
      setIsListening(false)
      return
    }

    stopSpeaking()
    setIsSpeaking(false)

    const recognizer = createSpeechRecognizer(
      (transcript, isFinal) => {
        setPrompt(transcript)
        if (isFinal && transcript.trim()) {
          setIsListening(false)
          recognizerRef.current = null
          handleSpeechOrQuery(transcript)
        }
      },
      () => {
        setIsListening(false)
        recognizerRef.current = null
      },
      (err) => {
        setIsListening(false)
        recognizerRef.current = null
        setVoiceNotice(err)
        setTimeout(() => setVoiceNotice(""), 4500)
      }
    )

    if (recognizer) {
      recognizerRef.current = recognizer
      try {
        recognizer.start()
        setIsListening(true)
      } catch (e: any) {
        setIsListening(false)
        setVoiceNotice(e.message || "Failed to start microphone")
        setTimeout(() => setVoiceNotice(""), 4500)
      }
    }
  }

  // Fast client-side intent routing for instant screen navigation and live data querying
  const handleSpeechOrQuery = async (queryText: string) => {
    const clean = queryText.trim()
    if (!clean) return

    const lower = clean.toLowerCase()

    // 1. Instant Navigation Intents
    if (lower.includes("crm") || lower.includes("lead crm") || lower.includes("show leads") || lower.includes("go to leads")) {
      onNavigate("Revenue", "Lead CRM")
      const reply = "Navigating to your Lead CRM workspace."
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("pipeline") || lower.includes("deals") || lower.includes("sales pipeline")) {
      onNavigate("Revenue", "Sales pipeline")
      const reply = "Showing the Sales Pipeline board."
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("proposals") || lower.includes("invoices") || lower.includes("billing") || lower.includes("upi")) {
      onNavigate("Revenue", "Proposals & invoices")
      const reply = "Opening Proposals and Invoices workspace with live UPI QR and UTR validation."
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("approvals") || lower.includes("decisions") || lower.includes("pending approval")) {
      onNavigate("My Day", "Approvals")
      const reply = `Opening Approval Centre. You have ${data.approvals.filter((a) => a.status === "Pending").length} pending requests.`
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("priorities") || lower.includes("tasks") || lower.includes("to do") || lower.includes("todo")) {
      onNavigate("My Day", "My priorities")
      const reply = `Showing My Priorities. You have ${data.tasks.filter((t) => t.status !== "Done").length} open tasks.`
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("my day") || lower.includes("today") || lower.includes("daily overview") || lower.includes("briefing")) {
      onNavigate("My Day", "Overview")
      const reply = "Opening your My Day Command Center."
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("projects") || lower.includes("deliverables")) {
      onNavigate("Digital World", "Projects")
      const reply = `Opening Digital World Projects. Active projects: ${data.projects.length}.`
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("clients") || lower.includes("client portfolio")) {
      onNavigate("Digital World", "Clients")
      const reply = `Showing Client Portfolio. Total clients: ${data.clients.length}.`
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("settings") || lower.includes("integrations") || lower.includes("api key") || lower.includes("voice settings")) {
      onNavigate("Execution & Settings", "Integrations")
      const reply = "Navigating to Execution & Settings -> Integrations."
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("models") || lower.includes("ai models") || lower.includes("groq") || lower.includes("gemini")) {
      onNavigate("AI Team", "Models")
      const reply = "Opening AI Team Models workspace."
      respondDirectly(clean, reply)
      return
    }

    // 2. Mock Data Reset and Slate Switching
    if (lower.includes("reset mock") || lower.includes("clean slate") || lower.includes("wipe data") || lower.includes("clear mock")) {
      dispatch({ type: "reset-clean" })
      const reply = "Mock data cleared! You are now in Clean Live Business Mode with a fresh slate."
      respondDirectly(clean, reply)
      return
    }
    if (lower.includes("load demo") || lower.includes("sample data") || lower.includes("demo mode")) {
      dispatch({ type: "reset-demo" })
      const reply = "Loaded sample demo fixtures for agency demonstration."
      respondDirectly(clean, reply)
      return
    }

    // 3. Lead & Contact Query (e.g. "Do we have someone named Mahesh?" or "Checkout lead Mahesh")
    const leadQueryMatch = lower.match(/(?:do we have|check out|checkout|find|search|is there someone named|tell me about)\s+(?:lead\s+)?([a-z0-9\s]+)/i)
    if (leadQueryMatch && leadQueryMatch[1]) {
      const searchTerm = leadQueryMatch[1].replace(/details|lead|please|sir/gi, "").trim()
      if (searchTerm.length >= 2) {
        const found = data.leads.find(
          (l) =>
            l.contact.toLowerCase().includes(searchTerm) ||
            l.company.toLowerCase().includes(searchTerm) ||
            (l.category && l.category.toLowerCase().includes(searchTerm))
        )
        if (found) {
          setSelectedRecord(found.id)
          onNavigate("Revenue", "Lead details")
          const reply = `Yes sir. We have ${found.contact} from ${found.company}. Stage is ${found.stage}, potential value is ₹${found.value.toLocaleString("en-IN")}. Opening the record details now.`
          respondDirectly(clean, reply)
          return
        }
      }
    }

    // 4. Otherwise, send to backend intelligence with live context
    sendQuery(clean)
  }

  const respondDirectly = (userPrompt: string, assistantReply: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: userPrompt },
      { id: `a-${Date.now()}`, role: "assistant", text: assistantReply, model: "THALOS FAST ROUTER" },
    ])
    setPrompt("")
    if (voiceSettings.enabled && voiceSettings.autoSpeak) {
      setIsSpeaking(true)
      speakResponse(assistantReply, voiceSettings).finally(() => setIsSpeaking(false))
    }
  }

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
    try {
      // Assemble active context snippet to give THALOS intelligence real-time dashboard awareness
      const contextSummary = {
        activeScreen: `${environment} / ${workspace}`,
        totalLeads: data.leads.length,
        pendingApprovals: data.approvals.filter((a) => a.status === "Pending").length,
        openTasks: data.tasks.filter((t) => t.status !== "Done").length,
        activeProjects: data.projects.length,
        sampleLeads: data.leads.slice(0, 8).map((l) => ({ id: l.id, company: l.company, contact: l.contact, stage: l.stage, value: l.value })),
      }

      const contextualMessage = `[Screen Context: ${contextSummary.activeScreen} | Leads: ${contextSummary.totalLeads} | Approvals: ${contextSummary.pendingApprovals} | Tasks: ${contextSummary.openTasks}]\nUser query: ${trimmed}`

      const res = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: contextualMessage }),
      })
      const respData = await res.json()
      if (res.ok) {
        if (respData.model_used) setActiveModel(respData.model_used)
        let assistantText = respData.response || "Outcome evaluated."

        // Parse structured tags in assistant response e.g. [[NAVIGATE: Revenue / Lead CRM]]
        const navMatch = assistantText.match(/\[\[NAVIGATE:\s*([A-Za-z\s&]+)\s*\/\s*([A-Za-z\s&]+)\]\]/i)
        if (navMatch) {
          const envTarget = navMatch[1].trim() as Environment
          const wsTarget = navMatch[2].trim()
          if (environments.some((e) => e.name === envTarget)) {
            onNavigate(envTarget, wsTarget)
          }
          assistantText = assistantText.replace(navMatch[0], "").trim()
        }

        const selMatch = assistantText.match(/\[\[SELECT_LEAD:\s*([a-zA-Z0-9_-]+)\]\]/i)
        if (selMatch) {
          setSelectedRecord(selMatch[1].trim())
          assistantText = assistantText.replace(selMatch[0], "").trim()
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: assistantText,
            model: respData.model_used,
            intent: respData.intent,
            actions: respData.actions_taken,
          },
        ])

        if (voiceSettings.enabled && voiceSettings.autoSpeak) {
          setIsSpeaking(true)
          speakResponse(assistantText, voiceSettings).finally(() => setIsSpeaking(false))
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: respData.error || respData.message || "Failed to process request with THALOS intelligence.",
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
          text: `Connection notice: ${err.message || "Backend offline"}. THALOS local workspace remains functional.`,
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const suggestionChips = [
    "Take me to Lead CRM",
    "Show pending approvals",
    "Do we have someone named Maya?",
    "Reset mock data",
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
            Context · {environment} {activeModel !== "auto" ? `· ${activeModel}` : "· Live Assistant"}
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
              <span>Voice & Screen Awareness · {environment}</span>
            </div>
            <button
              className="icon-button"
              style={{ marginRight: 4 }}
              aria-label={voiceSettings.autoSpeak ? "Mute audio response" : "Unmute audio response"}
              title={voiceSettings.autoSpeak ? "Voice responses active (Click to mute)" : "Voice responses muted (Click to unmute)"}
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking()
                  setIsSpeaking(false)
                }
                const updated = { ...voiceSettings, autoSpeak: !voiceSettings.autoSpeak }
                setVoiceSettings(updated)
                saveVoiceSettings(updated)
              }}
            >
              {voiceSettings.autoSpeak ? <Volume2 size={15} style={{ color: "#54d9c7" }} /> : <VolumeX size={15} />}
            </button>
            {messages.length > 0 && (
              <button
                className="icon-button"
                style={{ marginRight: 6 }}
                aria-label="Clear conversation"
                title="Clear conversation"
                onClick={() => {
                  stopSpeaking()
                  setIsSpeaking(false)
                  setMessages([])
                }}
              >
                <X size={14} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Close companion"
              onClick={() => {
                stopSpeaking()
                setIsSpeaking(false)
                setOpen(false)
              }}
            >
              <X size={17} />
            </button>
          </div>

          <div className="companion-thread">
            {messages.length === 0 ? (
              <div className="companion-welcome">
                <span className="eyebrow">READY TO ASSIST</span>
                <h3>What outcome are we working toward?</h3>
                <p>
                  Speak naturally to THALOS: Ask for a lead by name, navigate screens, review approvals, or manage your pipeline.
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
                    {m.intent === "configuration_needed" && (
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
                    <p>Evaluating outcome and executing tool directives...</p>
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
                onClick={() => handleSpeechOrQuery(chip)}
                disabled={loading}
              >
                {chip}
              </button>
            ))}
          </div>

          {(isListening || isSpeaking || voiceNotice) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 14px",
                fontSize: "10px",
                background: isListening
                  ? "rgba(224, 75, 75, 0.15)"
                  : isSpeaking
                  ? "rgba(84, 217, 199, 0.15)"
                  : "rgba(255, 255, 255, 0.05)",
                borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                color: isListening ? "#ff8585" : isSpeaking ? "#54d9c7" : "#e0ba7e",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {isListening && <Mic size={12} className="animate-pulse" />}
                {isSpeaking && <Volume2 size={12} className="animate-pulse" />}
                <span>
                  {isListening ? "Listening... speak command now" : isSpeaking ? "THALOS is speaking..." : voiceNotice}
                </span>
              </div>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={() => {
                    stopSpeaking()
                    setIsSpeaking(false)
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#839ba7",
                    cursor: "pointer",
                    fontSize: "9px",
                    textDecoration: "underline",
                  }}
                >
                  Stop audio
                </button>
              )}
            </div>
          )}

          <form
            className="companion-compose"
            onSubmit={(e) => {
              e.preventDefault()
              handleSpeechOrQuery(prompt)
            }}
          >
            <input
              name="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              aria-label="Ask THALOS a question"
              placeholder="Ask THALOS to navigate, find leads, or run actions…"
              disabled={loading}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) {
                  event.preventDefault()
                }
              }}
            />
            {voiceSettings.enabled && (
              <button
                type="button"
                className="companion-send"
                aria-label={isListening ? "Stop voice listening" : "Start voice listening"}
                title={isListening ? "Listening... click to stop" : "Speak to THALOS"}
                onClick={toggleListening}
                style={{
                  background: isListening ? "#e04b4b" : "#173543",
                  color: isListening ? "#ffffff" : "#68e0e7",
                }}
              >
                {isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}
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

export default function ThalosApp({
  initialEnvironment,
  initialWorkspace,
}: {
  initialEnvironment?: Environment
  initialWorkspace?: string
}) {
  const { offline } = usePwaStatus()
  const pathname = usePathname()
  const router = useRouter()

  const [data, dispatch] = useReducer(reducer, undefined, loadSavedState)
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState("")

  const isDemo = data.leads.some((l) => l.id.includes("northstar"))

  const segments = (pathname ?? "/").split("/").filter(Boolean)
  let environment = initialEnvironment ?? environments[0].name
  let workspace = initialWorkspace ?? "Overview"

  if (segments.length) {
    const found = environments.find((e) => slugify(e.name) === segments[0])
    if (found) {
      environment = found.name
      workspace = workspaceFromSlug(environment, segments[1])
    }
  }

  const active = environments.find((e) => e.name === environment)!
  const EnvironmentIcon = icons[environments.findIndex((e) => e.name === environment)]
  const navigate = (env: Environment, page = workspaces[env][0]) => router.push(`/${slugify(env)}/${slugify(page)}`)

  return (
    <main className="app-shell">
      <header className="topbar">
        <BrandMark />
        <div className="topbar-center">
          <span className="system-dot" />
          <span className="system-label">THALOS CORE</span>
          <span className="topbar-divider" />
          <span className="topbar-location">
            <Activity size={14} />
            {environment}
          </span>
          <span className="topbar-divider topbar-date-divider" />
          <span className="topbar-date">
            Ahmedabad (IST) <span>·</span> {new Date().toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" })}
          </span>
        </div>

        <div className="topbar-actions">
          {isDemo ? (
            <button
              type="button"
              className="demo-badge"
              title="Click to wipe mock data and switch to clean business mode"
              onClick={() => {
                if (window.confirm("Clear all mock demo data and switch to Clean Live Mode?")) {
                  dispatch({ type: "reset-clean" })
                }
              }}
              style={{ cursor: "pointer", border: "1px solid rgba(224, 186, 126, 0.4)" }}
            >
              <span /> DEMO ACTIVE · Click to Reset Clean
            </button>
          ) : (
            <button
              type="button"
              className="demo-badge"
              title="Clean live business mode active. Click to load demo fixtures if needed."
              onClick={() => {
                if (window.confirm("Load sample demo data?")) {
                  dispatch({ type: "reset-demo" })
                }
              }}
              style={{
                cursor: "pointer",
                background: "rgba(84, 217, 199, 0.1)",
                color: "#54d9c7",
                border: "1px solid rgba(84, 217, 199, 0.3)",
              }}
            >
              <CheckCircle2 size={10} style={{ display: "inline", marginRight: 4 }} /> LIVE SLATE · Load Demo
            </button>
          )}

          <button
            className="icon-button top-action"
            title="Clean mock data"
            aria-label="Reset mock data"
            onClick={() => {
              if (window.confirm("Reset all mock data to clean slate?")) {
                dispatch({ type: "reset-clean" })
              }
            }}
          >
            <Trash2 size={15} style={{ color: "#e0ba7e" }} />
          </button>

          <button
            className="icon-button top-action"
            aria-label="Search workspace"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={17} />
          </button>

          <button
            className="icon-button top-action notification-button"
            aria-label="Notifications"
            onClick={() => setNotice(notice ? "" : `THALOS active: ${data.leads.length} leads in CRM, ${data.approvals.filter((a) => a.status === "Pending").length} pending approvals.`)}
          >
            <Bell size={17} />
          </button>

          <PwaInstallButton />

          <button
            className="user-avatar"
            aria-label="User profile"
            onClick={() => navigate("Execution & Settings", "Integrations")}
          >
            S
          </button>
        </div>

        {notice && (
          <button className="notice-popover" onClick={() => setNotice("")}>
            {notice}
            <X size={14} />
          </button>
        )}
      </header>

      <RadialNavigation selected={environment} onSelect={(env) => navigate(env)} />

      {searchOpen && (
        <div className="global-search">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Search workspaces, records, contacts, agents…"
            aria-label="Search all THALOS"
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchOpen(false)
              if (e.key === "Enter") {
                const val = (e.currentTarget.value || "").toLowerCase()
                if (val.includes("setting") || val.includes("key") || val.includes("integ") || val.includes("upi")) {
                  navigate("Execution & Settings", "Integrations")
                } else if (val.includes("model") || val.includes("ai") || val.includes("groq") || val.includes("gemini")) {
                  navigate("AI Team", "Models")
                } else if (val.includes("crm") || val.includes("lead")) {
                  navigate("Revenue", "Lead CRM")
                } else if (val.includes("invoice") || val.includes("proposal")) {
                  navigate("Revenue", "Proposals & invoices")
                } else if (val.includes("health") || val.includes("status")) {
                  navigate("Execution & Settings", "System health")
                } else if (val.includes("approval")) {
                  navigate("My Day", "Approvals")
                } else if (val.includes("task")) {
                  navigate("Digital World", "Tasks")
                }
                setSearchOpen(false)
              }
            }}
          />
          <kbd>ESC</kbd>
          <button onClick={() => setSearchOpen(false)} aria-label="Close search">
            <X size={15} />
          </button>
        </div>
      )}

      <MobileCommandBar environment={environment} workspace={workspace} offline={offline} onNavigate={navigate} />

      <div className="main-layout">
        <section className="workspace-main">
          <div className="environment-hero">
            <div className="hero-orbit orbit-a" />
            <div className="hero-orbit orbit-b" />
            <div className="hero-copy">
              <div className="breadcrumb">
                <span>YUGANTAR GROWTH</span>
                <span>/</span>
                <span>{environment.toUpperCase()}</span>
              </div>
              <div className="hero-titleline">
                <div className="environment-icon">
                  <EnvironmentIcon size={23} />
                </div>
                <div>
                  <h1>{environment === "My Day" ? "Good morning, Shlok." : environment}</h1>
                  <p>{active.description} <span>·</span> {workspace}</p>
                </div>
              </div>
            </div>
            <div className="hero-status">
              <span className="status-orbit">
                <Activity size={16} />
              </span>
              <div>
                <b>{isDemo ? "Demo Environment" : "Live Operating System"}</b>
                <small>{isDemo ? "Sample fixtures loaded" : "Persistent storage active"}</small>
              </div>
              <ChevronDown size={15} />
            </div>
          </div>

          <nav className="route-nav" id="workspace-nav" aria-label={`${environment} workspaces`}>
            {workspaces[environment].map((page) => (
              <button
                key={page}
                aria-current={workspace === page ? "page" : undefined}
                className={workspace === page ? "route-tab active" : "route-tab"}
                onClick={() => navigate(environment, page)}
              >
                {page}
              </button>
            ))}
          </nav>

          <WorkspaceContent
            environment={environment}
            workspace={workspace}
            data={data}
            selectedRecord={selectedRecord}
            onSelectRecord={setSelectedRecord}
            onTask={(id, status) => dispatch({ type: "task", id, status })}
            onEditTask={(id, title) => dispatch({ type: "edit-task", id, title })}
            onApproval={(id, status) => dispatch({ type: "approval", id, status })}
            onOperation={(id, status) => dispatch({ type: "operation", id, status })}
            onCreateTask={(title) => dispatch({ type: "create-task", title })}
            onNavigate={navigate}
            onImportLeads={(newLeads) => dispatch({ type: "import-leads", leads: newLeads })}
            onCreateLead={(newLead) => dispatch({ type: "create-lead", lead: newLead })}
            onUpdateLead={(id, updates) => dispatch({ type: "update-lead", id, updates })}
            onUpdateInvoice={(id, updates) => dispatch({ type: "update-invoice", id, updates })}
            onResetClean={() => dispatch({ type: "reset-clean" })}
            onResetDemo={() => dispatch({ type: "reset-demo" })}
          />

          <footer className="workspace-footer">
            <span>THALOS <b>CORE</b></span>
            <span>One Intelligence. Every Device.</span>
            <span><CircleHelp size={13} /> Help & feedback</span>
          </footer>
        </section>

        <aside className="right-rail">
          <section className="panel rail-companion">
            <div className="rail-heading">
              <span className="eyebrow">VOICE & CONVERSATION</span>
              <span className="sparkle-mark"><Sparkles size={16} /></span>
            </div>
            <div className="rail-orbital">
              <div className="orbital-ring ring-a" />
              <div className="orbital-ring ring-b" />
              <div className="orbital-ring ring-c" />
              <div className="orbital-core">
                <svg viewBox="0 0 42 42" aria-hidden="true">
                  <path d="M21 4 5 35l16-8 16 8L21 4Z" />
                  <path d="m13 28 8-17 8 17-8-4-8 4Z" />
                </svg>
              </div>
              <span className="orbit-point point-a"><Sparkles size={14} /></span>
              <span className="orbit-point point-b"><Cpu size={14} /></span>
              <span className="orbit-point point-c"><Zap size={14} /></span>
            </div>
            <h3>Speak or Chat with THALOS.</h3>
            <p>Voice-directed navigation across CRM, Proposals, Priorities, and Settings.</p>
            <button
              className="rail-ask-button"
              onClick={() => window.dispatchEvent(new Event("trigger-thalos-voice"))}
              style={{ background: "#173f4d", color: "#6ce5ee", borderColor: "#296475" }}
            >
              <Mic size={15} style={{ marginRight: 6 }} /> Speak to THALOS
            </button>
            <div className="rail-note">
              <span className="rail-note-dot" />Screen aware <span>·</span> {environment} / {workspace}
            </div>
          </section>

          <section className="panel rail-ops">
            <div className="panel-heading">
              <div><span className="eyebrow">ON THE RADAR</span><h2>Worth a look</h2></div>
              <span className="count-badge">
                {data.approvals.filter((a) => a.status === "Pending").length.toString().padStart(2, "0")}
              </span>
            </div>
            {data.approvals
              .filter((a) => a.status === "Pending")
              .slice(0, 2)
              .map((a) => (
                <button className="radar-row" key={a.id} onClick={() => navigate("My Day", "Approvals")}>
                  <span className="round-icon amber"><ShieldCheck size={15} /></span>
                  <span>
                    <b>{a.title}</b>
                    <small>{data.agents.find((agent) => agent.id === a.agentId)?.name} · {a.impact}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            {data.operations
              .filter((o) => o.status === "Running")
              .slice(0, 1)
              .map((o) => (
                <button className="radar-row" key={o.id} onClick={() => navigate("My Day", "Active operations")}>
                  <span className="round-icon cyan"><Layers3 size={15} /></span>
                  <span>
                    <b>{o.name}</b>
                    <small>{o.progress}% · {o.stage}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            {data.approvals.filter((a) => a.status === "Pending").length === 0 && (
              <p style={{ fontSize: "11px", color: "#839ba7", padding: "8px 0" }}>
                All decisions clear. No pending approvals.
              </p>
            )}
          </section>

          <section className="panel rail-knowledge">
            <div className="panel-heading">
              <div><span className="eyebrow">MEMORY, WITH SOURCES</span><h2>Recently in context</h2></div>
              <BookOpen size={16} />
            </div>
            {data.documents.slice(0, 2).map((d) => (
              <button className="knowledge-row" key={d.id} onClick={() => navigate("Knowledge", "Documents")}>
                <span className="doc-icon"><FileText size={16} /></span>
                <span>
                  <b>{d.title}</b>
                  <small>{d.collection} · {d.source}</small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </section>

          <div className="rail-environment">
            <span className="eyebrow">YOUR ENVIRONMENT</span>
            <div className="env-pills">
              {environments.map((e, i) => {
                const Icon = icons[i]
                return (
                  <button
                    className={e.name === environment ? "env-pill active" : "env-pill"}
                    key={e.name}
                    onClick={() => navigate(e.name)}
                  >
                    <Icon size={14} />
                    <span>{e.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="rail-bottom-note">
              <span>{isDemo ? "Demo Data Mode" : "Clean Live Mode"}</span>
              <span>·</span>
              <span>Local Storage Encrypted</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Floating Quick-Access Voice Orb */}
      <button
        type="button"
        className="floating-voice-orb"
        title="Tap to speak to THALOS"
        aria-label="Tap to speak to THALOS"
        onClick={() => window.dispatchEvent(new Event("trigger-thalos-voice"))}
        style={{
          position: "fixed",
          bottom: 24,
          right: 280,
          zIndex: 90,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #29e3d1, #0f4f5a)",
          border: "2px solid rgba(84, 217, 199, 0.4)",
          color: "#08151b",
          boxShadow: "0 4px 20px rgba(41, 227, 209, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "transform 0.2s, box-shadow 0.2s",
        }}
      >
        <Mic size={22} style={{ color: "#061f26" }} />
      </button>

      <Companion
        environment={environment}
        workspace={workspace}
        data={data}
        dispatch={dispatch}
        setSelectedRecord={setSelectedRecord}
        onNavigate={navigate}
      />
    </main>
  )
}
