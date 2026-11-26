"use client"

import { useEffect, useMemo, useState } from "react"
import type { Approval, ApprovalStatus, DemoState, Environment, Lead, Operation, OperationStatus, Task, TaskStatus } from "@/lib/thalos-data"
import {
  Activity, AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Clock3,
  Copy, Cpu, Database, Download, ExternalLink, FileSpreadsheet, Key, MessageSquare,
  Mic, Phone, Plus, QrCode, RefreshCw, Search, Send, ShieldAlert, ShieldCheck,
  Sparkles, Trash2, Upload, Volume2, X, Zap
} from "lucide-react"
import { getStoredVoiceSettings, saveVoiceSettings, speakResponse, DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/lib/voice"
import { parseAndTriageCSV, getCSVPreview, exportLeadsToCSV, triggerDownload, type ParsedCsvLead } from "@/lib/csvParser"
import { triageLead } from "@/lib/leadTriageEngine"
import {
  generateUpiPaymentDetails, validateUpiReference, evaluateAdvancePaymentGate,
  getStoredUpiConfig, saveStoredUpiConfig, type UpiConfig
} from "@/lib/upiEngine"
import {
  OBJECTION_BANK, buildHinglishWhatsAppPitch, getPersonalizedObjectionScript, type ObjectionCategory
} from "@/lib/objectionBank"
import {
  uploadBackendDocument, searchBackendKnowledge, fetchBackendDocuments,
  fetchBackendQueue, apiFetch, fetchBackendTools, fetchModelsCatalogue,
  testBackendIntegration, saveBackendSettings, fetchIntegrationsStatus
} from "@/lib/api"

type Props = {
  environment: Environment
  workspace: string
  data: DemoState
  selectedRecord: string | null
  onSelectRecord: (id: string | null) => void
  onTask: (id: string, status: TaskStatus) => void
  onEditTask: (id: string, title: string) => void
  onApproval: (id: string, status: ApprovalStatus) => void
  onOperation: (id: string, status: OperationStatus) => void
  onCreateTask: (title: string) => void
  onNavigate: (environment: Environment, workspace: string) => void
  onImportLeads?: (leads: any[]) => void
  onCreateLead?: (lead: any) => void
  onUpdateLead?: (id: string, updates: any) => void
  onUpdateInvoice?: (id: string, updates: any) => void
  onResetClean?: () => void
  onResetDemo?: () => void
}

const money = (value: number) => `₹${(value || 0).toLocaleString("en-IN")}`
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section className={`workspace-card ${className}`}>{children}</section>
)
const Heading = ({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) => (
  <div className="view-heading">
    <div>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
    {action}
  </div>
)
const AgentName = ({ data, id }: { data: DemoState; id: string }) => data.agents.find((a) => a.id === id)?.name ?? "Unassigned"

export function WorkspaceContent(props: Props) {
  const { environment, workspace, data } = props
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("All")
  const [view, setView] = useState<"List" | "Board">("List")
  const selected = props.selectedRecord
  const setSelected = props.onSelectRecord
  const [draft, setDraft] = useState("")

  const projectName = (id: string) => data.projects.find((p) => p.id === id)?.name ?? "General"
  const clientName = (id: string) => data.clients.find((c) => c.id === id)?.name ?? "Prospect"
  const taskMatches = (task: Task) =>
    `${task.title} ${projectName(task.projectId)} ${task.assignee} ${AgentName({ data, id: task.agentId })}`.toLowerCase().includes(query.toLowerCase())

  // 1. My Day -> Overview (Command Center with 4 Queues & Single Next Action)
  if (environment === "My Day" && workspace === "Overview") {
    const pendingApprovals = data.approvals.filter((a) => a.status === "Pending")
    const tierALeads = data.leads.filter((l) => l.tier === "A" && (l.stage === "New" || l.stage === "Discovery"))
    const openTasks = data.tasks.filter((t) => t.status !== "Done")
    const pendingInvoices = data.invoices.filter((i) => !i.advanceReceived)

    // Single Next Action Calculation
    let nextActionTitle = "Review daily pipeline & lead discovery"
    let nextActionContext = "All urgent queues are clear. Discover new leads or run batch outreach."
    let nextActionTarget: [Environment, string] = ["Revenue", "Lead CRM"]

    if (pendingApprovals.length > 0) {
      nextActionTitle = `Approve ${pendingApprovals[0].title}`
      nextActionContext = `High impact approval waiting for ${pendingApprovals[0].action}.`
      nextActionTarget = ["My Day", "Approvals"]
    } else if (pendingInvoices.length > 0) {
      nextActionTitle = `Verify 50% advance for invoice ${pendingInvoices[0].number}`
      nextActionContext = `Amount: ${money(pendingInvoices[0].amount)} · Advance payment gate locked.`
      nextActionTarget = ["Revenue", "Proposals & invoices"]
    } else if (tierALeads.length > 0) {
      nextActionTitle = `Send 6-line WhatsApp Pitch to ${tierALeads[0].company}`
      nextActionContext = `Contact: ${tierALeads[0].contact} · High-fit Tier A prospect (Score: ${tierALeads[0].fitScore || 85}).`
      nextActionTarget = ["Revenue", "Lead details"]
    } else if (openTasks.length > 0) {
      nextActionTitle = `Work on: ${openTasks[0].title}`
      nextActionContext = `Due: ${openTasks[0].due} · Priority: ${openTasks[0].priority}.`
      nextActionTarget = ["My Day", "My priorities"]
    }

    return (
      <div className="purpose-page">
        <Heading
          eyebrow="MY DAY / COMMAND CENTER"
          title="Daily Business Focus"
          detail="Command center for solo operations: 4 live action queues, single next action, and active delivery pulse."
        />

        {/* Single Next Action Priority Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(84, 217, 199, 0.12), rgba(20, 50, 65, 0.4))",
            border: "1px solid rgba(84, 217, 199, 0.35)",
            borderRadius: "8px",
            padding: "16px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "10px", fontWeight: "bold", color: "#54d9c7", letterSpacing: "1px" }}>
                SINGLE NEXT ACTION
              </span>
              <span style={{ fontSize: "9px", background: "rgba(84, 217, 199, 0.2)", color: "#54d9c7", padding: "2px 6px", borderRadius: "4px" }}>
                HIGHEST PRIORITY
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: "16px", color: "#ffffff" }}>{nextActionTitle}</h3>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#8daab9" }}>{nextActionContext}</p>
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={() => {
              if (nextActionTarget[1] === "Lead details" && tierALeads.length > 0) {
                setSelected(tierALeads[0].id)
              }
              props.onNavigate(nextActionTarget[0], nextActionTarget[1])
            }}
            style={{ fontSize: "12px", padding: "8px 16px" }}
          >
            Take Action <ArrowRight size={14} style={{ marginLeft: 4 }} />
          </button>
        </div>

        {/* 4 Operational Queues */}
        <div className="metric-row">
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#68e0e7" }}>📤 SEND QUEUE</span>
              <span style={{ fontSize: "10px", color: "#839ba7" }}>First Outreach</span>
            </div>
            <strong>{data.leads.filter((l) => l.stage === "New" || l.stage === "Discovery").length} Leads</strong>
            <small>Ready for 6-line WhatsApp pitch</small>
            <button
              className="text-action"
              style={{ marginTop: 8 }}
              onClick={() => props.onNavigate("Revenue", "Lead CRM")}
            >
              Open Send Queue <ArrowRight size={12} />
            </button>
          </Card>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#e0ba7e" }}>💬 REPLY & OBJECTIONS</span>
              <span style={{ fontSize: "10px", color: "#839ba7" }}>Follow-ups</span>
            </div>
            <strong>{data.leads.filter((l) => l.stage === "Contacted" || l.stage === "Qualified").length} Active</strong>
            <small>Requires objection handling script</small>
            <button
              className="text-action"
              style={{ marginTop: 8 }}
              onClick={() => props.onNavigate("Revenue", "Lead CRM")}
            >
              Open Conversations <ArrowRight size={12} />
            </button>
          </Card>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#55d9bb" }}>💰 MONEY & ADVANCES</span>
              <span style={{ fontSize: "10px", color: "#839ba7" }}>UTR Check</span>
            </div>
            <strong>{pendingInvoices.length} Pending</strong>
            <small>Total: {money(pendingInvoices.reduce((acc, i) => acc + i.amount, 0))}</small>
            <button
              className="text-action"
              style={{ marginTop: 8 }}
              onClick={() => props.onNavigate("Revenue", "Proposals & invoices")}
            >
              Verify Bank UTRs <ArrowRight size={12} />
            </button>
          </Card>

          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#c6a8ee" }}>🚀 ACTIVE PROJECTS</span>
              <span style={{ fontSize: "10px", color: "#839ba7" }}>48h SLA</span>
            </div>
            <strong>{data.projects.filter((p) => p.status !== "Complete").length} Deliveries</strong>
            <small>WIP Limit: 2 Active builds max</small>
            <button
              className="text-action"
              style={{ marginTop: 8 }}
              onClick={() => props.onNavigate("Digital World", "Projects")}
            >
              Project Navigator <ArrowRight size={12} />
            </button>
          </Card>
        </div>

        <div className="content-columns">
          <Card>
            <div className="card-title">
              <div>
                <span className="eyebrow">HOT PROSPECTS</span>
                <h3>High ICP Tier A Leads</h3>
              </div>
              <button className="text-action" onClick={() => props.onNavigate("Revenue", "Lead CRM")}>
                All Leads <ArrowRight size={14} />
              </button>
            </div>
            {data.leads.filter((l) => l.tier === "A" || l.stage === "Qualified").slice(0, 4).map((lead) => (
              <button
                className="linked-row"
                key={lead.id}
                onClick={() => {
                  setSelected(lead.id)
                  props.onNavigate("Revenue", "Lead details")
                }}
              >
                <span className="round-icon cyan">{lead.company[0]}</span>
                <span>
                  <b>{lead.company} · {lead.contact}</b>
                  <small>{lead.city || "Ahmedabad"} · {lead.category || "Commercial"} · {money(lead.value)}</small>
                </span>
                <span className="row-status" style={{ color: "#54d9c7" }}>
                  Tier {lead.tier || "A"} ({lead.fitScore || 85})
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
            {data.leads.length === 0 && (
              <p style={{ fontSize: "11px", color: "#8daab9", padding: "12px 0" }}>
                No leads yet. Click <b>Revenue → Lead CRM</b> to import your CSV spreadsheet!
              </p>
            )}
          </Card>

          <Card>
            <div className="card-title">
              <div>
                <span className="eyebrow">DECISION GATE</span>
                <h3>Pending Founder Approvals</h3>
              </div>
              <button className="text-action" onClick={() => props.onNavigate("My Day", "Approvals")}>
                Review ({pendingApprovals.length}) <ArrowRight size={14} />
              </button>
            </div>
            {pendingApprovals.map((a) => (
              <button
                className="linked-row"
                key={a.id}
                onClick={() => {
                  setSelected(a.id)
                  props.onNavigate("My Day", "Approvals")
                }}
              >
                <span className="round-icon amber"><ShieldCheck size={15} /></span>
                <span>
                  <b>{a.title}</b>
                  <small>{AgentName({ data, id: a.agentId })} · {a.action}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {pendingApprovals.length === 0 && <Empty text="No decisions waiting. Safety gate is clear." />}
          </Card>
        </div>
      </div>
    )
  }

  // 2. My Priorities
  if (environment === "My Day" && workspace === "My priorities") {
    return (
      <div className="purpose-page">
        <Heading
          eyebrow="PERSONAL WORK QUEUE"
          title="My priorities"
          detail="Your task list is connected to live delivery projects. Add, edit, and check off items."
          action={
            <button
              className="primary-action"
              onClick={() => {
                const title = draft.trim() || "New business priority"
                props.onCreateTask(title)
                setDraft("")
              }}
            >
              <Plus size={15} /> Add task
            </button>
          }
        />
        <Card>
          <div className="toolbar-row">
            <label className="search-box">
              <Search size={15} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks, assignees" aria-label="Search tasks" />
            </label>
            <select aria-label="Filter tasks" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option>All</option>
              <option>Open</option>
              <option>In progress</option>
              <option>Blocked</option>
              <option>Done</option>
            </select>
            <div className="segmented">
              <button aria-pressed={view === "List"} className={view === "List" ? "chosen" : ""} onClick={() => setView("List")}>List</button>
              <button aria-pressed={view === "Board"} className={view === "Board" ? "chosen" : ""} onClick={() => setView("Board")}>Board</button>
            </div>
          </div>
          <form
            className="inline-create"
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) props.onCreateTask(draft.trim())
              setDraft("")
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a new task to your queue…"
              aria-label="New task title"
            />
            <button type="submit" className="secondary-action">
              <Plus size={14} /> Create
            </button>
          </form>
          {view === "List" ? (
            <div className="task-table">
              {data.tasks
                .filter(taskMatches)
                .filter((t) => filter === "All" || t.status === filter)
                .map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    data={data}
                    selected={selected === t.id}
                    onSelect={() => setSelected(selected === t.id ? null : t.id)}
                    onTask={props.onTask}
                  />
                ))}
            </div>
          ) : (
            <div className="task-board">
              {(["Open", "In progress", "Blocked", "Done"] as TaskStatus[]).map((status) => (
                <div className="board-column" key={status}>
                  <h3>{status}<span>{data.tasks.filter((t) => t.status === status).length}</span></h3>
                  {data.tasks
                    .filter((t) => t.status === status && taskMatches(t))
                    .map((t) => (
                      <button className="board-task" key={t.id} onClick={() => setSelected(selected === t.id ? null : t.id)}>
                        <b>{t.title}</b>
                        <small>{projectName(t.projectId)} · {t.due}</small>
                        <span>{t.priority} · {AgentName({ data, id: t.agentId })}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
          {selected && data.tasks.find((t) => t.id === selected) && (
            <TaskDetail
              key={selected}
              task={data.tasks.find((t) => t.id === selected)!}
              data={data}
              onTask={props.onTask}
              onEditTask={props.onEditTask}
            />
          )}
          {data.tasks.filter(taskMatches).filter((t) => filter === "All" || t.status === filter).length === 0 && (
            <Empty text="No tasks match these filters." />
          )}
        </Card>
      </div>
    )
  }

  // 3. Approvals
  if ((environment === "My Day" && workspace === "Approvals") || (environment === "Execution & Settings" && workspace === "Approvals")) {
    return <ApprovalsPage data={data} onApproval={props.onApproval} />
  }

  // 4. Operations
  if (environment === "Execution & Settings" && workspace === "Operations") {
    return <OperationsPage data={data} onOperation={props.onOperation} />
  }

  // 5. Revenue Environment (CRM, Leads, Proposals, Invoices, Objection Bank)
  if (
    environment === "Revenue" &&
    [
      "Lead CRM", "Lead discovery", "Lead details", "Sales pipeline", "Outreach studio",
      "Communication centre", "Proposals & invoices", "Finance", "Revenue intelligence", "Overview"
    ].includes(workspace)
  ) {
    return (
      <RevenueWorkspace
        {...props}
        query={query}
        setQuery={setQuery}
        selected={selected}
        setSelected={setSelected}
      />
    )
  }

  // 6. Digital World (Clients, Projects, Tasks)
  if (
    environment === "Digital World" &&
    ["Clients", "Client details", "Projects", "Project details", "Tasks", "Services", "Assets", "Support", "Overview"].includes(workspace)
  ) {
    return <DigitalPage {...props} selected={selected} setSelected={setSelected} />
  }

  // 7. AI Team
  if (environment === "AI Team") {
    return <AgentsPage {...props} selected={selected} setSelected={setSelected} />
  }

  // 8. Knowledge
  if (environment === "Knowledge") {
    return <KnowledgePage {...props} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected} />
  }

  // 9. Execution & Settings
  return <SettingsPage {...props} selected={selected} setSelected={setSelected} />
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <Circle size={17} />
      <p>{text}</p>
    </div>
  )
}

function TaskRow({
  task, data, selected, onSelect, onTask
}: {
  task: Task; data: DemoState; selected: boolean; onSelect: () => void; onTask: Props["onTask"]
}) {
  return (
    <div className={`task-item ${selected ? "is-selected" : ""}`}>
      <button className="task-select" onClick={onSelect}>
        <span className={`task-check ${task.status === "Done" ? "is-done" : ""}`}>
          {task.status === "Done" && <Check size={12} />}
        </span>
        <span>
          <b>{task.title}</b>
          <small>{data.projects.find((p) => p.id === task.projectId)?.name || "Task"} · {task.due} · {AgentName({ data, id: task.agentId })}</small>
        </span>
      </button>
      <span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span>
      <select
        aria-label={`Status for ${task.title}`}
        value={task.status}
        onChange={(e) => onTask(task.id, e.target.value as TaskStatus)}
      >
        <option>Open</option>
        <option>In progress</option>
        <option>Blocked</option>
        <option>Done</option>
      </select>
    </div>
  )
}

function TaskDetail({
  task, data, onTask, onEditTask
}: {
  task: Task; data: DemoState; onTask: Props["onTask"]; onEditTask: Props["onEditTask"]
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)

  return (
    <div className="detail-box">
      <span className="eyebrow">TASK DETAILS · {task.id}</span>
      {editing ? (
        <label className="form-field">
          Task title
          <input aria-label="Edit task title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      ) : (
        <h3>{task.title}</h3>
      )}
      <p>{task.description}</p>
      <div className="detail-meta">
        <span>Project: {data.projects.find((p) => p.id === task.projectId)?.name || "Direct"}</span>
        <span>Assignee: {task.assignee}</span>
        <span>Agent: {AgentName({ data, id: task.agentId })}</span>
        <span>Due: {task.due}</span>
      </div>
      <div className="approval-buttons">
        {editing ? (
          <button
            className="primary-action"
            onClick={() => {
              if (title.trim()) onEditTask(task.id, title.trim())
              setEditing(false)
            }}
          >
            Save task
          </button>
        ) : (
          <button className="secondary-action" onClick={() => setEditing(true)}>
            Edit task
          </button>
        )}
        <button className="secondary-action" onClick={() => onTask(task.id, task.status === "Done" ? "Open" : "Done")}>
          {task.status === "Done" ? "Reopen task" : "Mark complete"}
        </button>
      </div>
    </div>
  )
}

function OperationRow({ operation, data }: { operation: Operation; data: DemoState }) {
  return (
    <div className="operation-row">
      <span className={`operation-mark ${operation.status.toLowerCase()}`} />
      <div>
        <b>{operation.name}</b>
        <small>{AgentName({ data, id: operation.agentId })} · {operation.stage}</small>
      </div>
      <span className="row-status">
        {operation.status}{operation.status === "Running" ? ` · ${operation.progress}%` : ""}
      </span>
    </div>
  )
}

function ApprovalsPage({ data, onApproval }: { data: DemoState; onApproval: Props["onApproval"] }) {
  const [tab, setTab] = useState("Pending")
  const rows = tab === "Pending" ? data.approvals.filter((a) => a.status === "Pending") : data.approvalHistory

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="APPROVAL CENTRE"
        title="Decisions, with context."
        detail="Review the requested action, rationale, risk, and linked records before choosing an outcome."
      />
      <Card>
        <div className="segmented approval-tabs">
          <button aria-pressed={tab === "Pending"} className={tab === "Pending" ? "chosen" : ""} onClick={() => setTab("Pending")}>
            Pending <span>{data.approvals.filter((a) => a.status === "Pending").length}</span>
          </button>
          <button aria-pressed={tab === "History"} className={tab === "History" ? "chosen" : ""} onClick={() => setTab("History")}>
            History <span>{data.approvalHistory.length}</span>
          </button>
        </div>
        {rows.map((a) => (
          <ApprovalCard key={a.id} approval={a} data={data} onApproval={onApproval} />
        ))}
        {rows.length === 0 && (
          <Empty text={tab === "Pending" ? "No pending requests. Safety gate is clear." : "No decision history yet."} />
        )}
      </Card>
    </div>
  )
}

function ApprovalCard({ approval, data, onApproval }: { approval: Approval; data: DemoState; onApproval: Props["onApproval"] }) {
  return (
    <article className="approval-record">
      <div className="record-topline">
        <span className="round-icon amber"><ShieldCheck size={16} /></span>
        <span className="row-status">{approval.status}</span>
        <small>{approval.created}</small>
      </div>
      <h3>{approval.title}</h3>
      <p className="approval-action-line"><b>Requested action:</b> {approval.action}</p>
      <div className="approval-context-grid">
        <div><span>REQUESTING AGENT</span><b>{AgentName({ data, id: approval.agentId })}</b></div>
        <div><span>WHY NOW</span><b>{approval.reason}</b></div>
        <div><span>IMPACT</span><b>{approval.impact}</b></div>
        <div><span>RISK</span><b>{approval.risk}</b></div>
      </div>
      <p>{approval.context}</p>
      {approval.status === "Pending" && (
        <div className="approval-buttons">
          <button className="primary-action" onClick={() => onApproval(approval.id, "Approved")}>
            <Check size={14} /> Approve
          </button>
          <button className="secondary-action" onClick={() => onApproval(approval.id, "Changes requested")}>
            Request changes
          </button>
          <button className="danger-action" onClick={() => onApproval(approval.id, "Rejected")}>
            <X size={14} /> Reject
          </button>
        </div>
      )}
    </article>
  )
}

function OperationsPage({ data, onOperation }: { data: DemoState; onOperation: Props["onOperation"] }) {
  const [tab, setTab] = useState("Live")
  const [queueMetrics, setQueueMetrics] = useState<any>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryNotice, setRetryNotice] = useState("")

  const loadQueue = () => {
    fetchBackendQueue()
      .then((res) => setQueueMetrics(res.queue))
      .catch((e) => console.warn("Queue telemetry notice:", e))
  }

  useEffect(() => {
    loadQueue()
    const timer = setInterval(loadQueue, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleRetryDeadLetter = async () => {
    setIsRetrying(true)
    setRetryNotice("")
    try {
      const res = await apiFetch("/api/system/queue/retry-dead-letter", { method: "POST" })
      setRetryNotice(`Successfully requeued ${res.retried_count ?? 0} dead-letter jobs.`)
      loadQueue()
    } catch (err: any) {
      setRetryNotice(err.message || "Failed to retry jobs")
    } finally {
      setIsRetrying(false)
    }
  }

  const active = data.operations.filter((o) => ["Running", "Queued", "Blocked", "Failed"].includes(o.status))
  const rows = tab === "Live" ? active : data.operations.filter((o) => ["Completed", "Cancelled"].includes(o.status))

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="EXECUTION MONITOR"
        title="Every run, accounted for."
        detail="Track live stages, owner agents, timestamps, blockers, and failures."
      />

      {/* Real Queue Telemetry Header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "12px" }}>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: "11px", color: "#8daab9" }}>QUEUED JOBS</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>{queueMetrics?.queued ?? 0}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: "11px", color: "#8daab9" }}>RUNNING / CLAIMED</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#54d9c7", marginTop: "4px" }}>{(queueMetrics?.running ?? 0) + (queueMetrics?.claimed ?? 0)}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: "11px", color: "#8daab9" }}>COMPLETED</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#54d9e8", marginTop: "4px" }}>{queueMetrics?.completed ?? 0}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: "11px", color: "#8daab9" }}>DEAD LETTER</div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: (queueMetrics?.dead_letter ?? 0) > 0 ? "#f87171" : "#8daab9", marginTop: "4px" }}>{queueMetrics?.dead_letter ?? 0}</div>
        </div>
      </div>

      {(queueMetrics?.dead_letter ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px" }}>
          <span style={{ fontSize: "12px", color: "#fca5a5" }}>{queueMetrics?.dead_letter} job(s) in dead-letter queue.</span>
          <button
            onClick={handleRetryDeadLetter}
            disabled={isRetrying}
            style={{ background: "#f87171", border: "none", color: "#fff", padding: "6px 14px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
          >
            {isRetrying ? "Retrying..." : "Retry All Dead Letter"}
          </button>
        </div>
      )}
      {retryNotice && <div style={{ fontSize: "12px", color: "#54d9c7", marginBottom: "10px" }}>{retryNotice}</div>}

      <Card>
        <div className="segmented approval-tabs">
          <button className={tab === "Live" ? "chosen" : ""} aria-pressed={tab === "Live"} onClick={() => setTab("Live")}>
            Live & queued <span>{active.length}</span>
          </button>
          <button className={tab === "History" ? "chosen" : ""} aria-pressed={tab === "History"} onClick={() => setTab("History")}>
            Execution history <span>{data.operations.length - active.length}</span>
          </button>
        </div>
        {rows.map((o) => (
          <article className="operation-card" key={o.id}>
            <div className="operation-card-head">
              <span className={`operation-mark ${o.status.toLowerCase()}`} />
              <div>
                <h3>{o.name}</h3>
                <p>{AgentName({ data, id: o.agentId })} · {o.started} · updated {o.updated}</p>
              </div>
              <span className="row-status">{o.status}</span>
            </div>
            <div className="progress-meta">
              <span>{o.stage}</span>
              <b>{o.progress}%</b>
            </div>
            <div className="progress-track"><i style={{ width: `${o.progress}%` }} /></div>
            {o.error && <p className="error-note">{o.error}</p>}
            {["Running", "Queued", "Blocked", "Failed"].includes(o.status) && (
              <div className="operation-controls">
                {["Failed", "Blocked"].includes(o.status) && (
                  <button className="secondary-action" onClick={() => onOperation(o.id, "Queued")}>Retry</button>
                )}
                {["Running", "Queued"].includes(o.status) && (
                  <button className="danger-action" onClick={() => onOperation(o.id, "Cancelled")}>Cancel</button>
                )}
              </div>
            )}
          </article>
        ))}
        {rows.length === 0 && <Empty text="No execution records in this view." />}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// REVENUE WORKSPACE (Lead CRM, Import/Export, ICP Triage, Objections, UPI & UTR)
// ─────────────────────────────────────────────────────────────
function RevenueWorkspace(
  props: Props & {
    query: string
    setQuery: (s: string) => void
    selected: string | null
    setSelected: (s: string | null) => void
  }
) {
  const { data, workspace, query, setQuery, selected, setSelected, onImportLeads, onCreateLead, onUpdateLead, onUpdateInvoice } = props

  // CRM Modals
  const [importOpen, setImportOpen] = useState(false)
  const [csvRawText, setCsvRawText] = useState("")
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; previewRows: string[][]; detectedMapping: Record<string, string>; totalRows: number } | null>(null)
  const [dedupeReport, setDedupeReport] = useState<any>(null)

  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [newLeadForm, setNewLeadForm] = useState({
    company: "",
    contact: "",
    phone: "",
    website: "",
    city: "Ahmedabad",
    category: "General Commercial",
    value: 25000,
    notes: "",
  })

  // Objection Bank State in Lead Details
  const [selectedObjection, setSelectedObjection] = useState<ObjectionCategory>("ALREADY_HAVE_AGENCY")
  const [copiedPitch, setCopiedPitch] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)

  // Invoice Payment & UTR State
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [utrInput, setUtrInput] = useState("")
  const [utrNotice, setUtrNotice] = useState("")

  const leads = data.leads.filter((lead) =>
    `${lead.company} ${lead.contact} ${lead.city || ""} ${lead.category || ""} ${lead.source || ""} ${lead.stage}`.toLowerCase().includes(query.toLowerCase())
  )

  const selectedLead = data.leads.find((lead) => lead.id === selected) || data.leads[0] || {
    id: "lead-new",
    company: "Select or Create a Lead",
    contact: "No contact",
    source: "Manual",
    stage: "New",
    value: 0,
    phone: "",
    city: "Ahmedabad",
    category: "",
    campaignId: "campaign-general",
  }

  const invoicesTotal = data.invoices.reduce((total, invoice) => total + invoice.amount, 0)

  // CSV Drag and Drop / Paste Handler
  const handleCsvTextChange = (text: string) => {
    setCsvRawText(text)
    if (!text.trim()) {
      setCsvPreview(null)
      setDedupeReport(null)
      return
    }
    const prev = getCSVPreview(text)
    setCsvPreview(prev)
    const report = parseAndTriageCSV(text, data.leads)
    setDedupeReport(report)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = String(event.target?.result || "")
      handleCsvTextChange(content)
    }
    reader.readAsText(file)
  }

  const executeCsvImport = () => {
    if (!dedupeReport || dedupeReport.newLeads.length === 0) return
    const formatted = dedupeReport.newLeads.map((l: ParsedCsvLead, idx: number) => ({
      id: `lead-import-${Date.now()}-${idx}`,
      company: l.company,
      contact: l.contact,
      phone: l.phone,
      email: l.email,
      website: l.website,
      city: l.city,
      category: l.category,
      source: "CSV Import",
      stage: l.stage || "New",
      value: l.value,
      tier: l.tier,
      fitScore: l.fitScore,
      triageReasons: l.triageReasons,
      notes: l.notes,
      campaignId: "campaign-import",
      created: new Date().toISOString(),
    }))
    if (onImportLeads) onImportLeads(formatted)
    setImportOpen(false)
    setCsvRawText("")
    setCsvPreview(null)
    setDedupeReport(null)
  }

  const handleAddManualLead = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadForm.company.trim()) return

    const triage = triageLead({
      company: newLeadForm.company,
      contact: newLeadForm.contact,
      phone: newLeadForm.phone,
      website: newLeadForm.website,
      city: newLeadForm.city,
      category: newLeadForm.category,
      notes: newLeadForm.notes,
    })

    const newLead: Lead = {
      id: `lead-manual-${Date.now()}`,
      company: newLeadForm.company.trim(),
      contact: newLeadForm.contact.trim() || "Business Owner",
      phone: newLeadForm.phone.trim(),
      website: newLeadForm.website.trim(),
      city: newLeadForm.city.trim() || "Ahmedabad",
      category: newLeadForm.category.trim(),
      source: "Manual",
      stage: "New",
      value: Number(newLeadForm.value) || 25000,
      tier: triage.tier,
      fitScore: triage.fitScore,
      triageReasons: triage.reasons,
      notes: newLeadForm.notes.trim(),
      campaignId: "campaign-local",
      created: new Date().toISOString(),
    }

    if (onCreateLead) onCreateLead(newLead)
    setAddLeadOpen(false)
    setNewLeadForm({
      company: "",
      contact: "",
      phone: "",
      website: "",
      city: "Ahmedabad",
      category: "General Commercial",
      value: 25000,
      notes: "",
    })
  }

  // 1. Lead Details Workspace
  if (workspace === "Lead details") {
    const pitch = buildHinglishWhatsAppPitch(selectedLead)
    const objectionScript = getPersonalizedObjectionScript(selectedObjection, selectedLead.company)
    const cleanPhone = (selectedLead.phone || "").replace(/[^0-9]/g, "")
    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(pitch)}` : null

    return (
      <div className="purpose-page">
        <Heading
          eyebrow="REVENUE / LEAD DOSSIER"
          title={selectedLead.company}
          detail={`${selectedLead.contact} · ${selectedLead.city || "Ahmedabad"} · ${selectedLead.category || "Commercial"} · ${money(selectedLead.value)}`}
          action={
            <div style={{ display: "flex", gap: "8px" }}>
              {selectedLead.phone && (
                <a
                  href={`tel:${selectedLead.phone}`}
                  className="secondary-action"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <Phone size={14} /> Call ({selectedLead.phone})
                </a>
              )}
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-action"
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#1f8a70" }}
                >
                  <MessageSquare size={14} /> Open WhatsApp
                </a>
              )}
            </div>
          }
        />

        {/* Triage & Fit Scoring Banner */}
        <div className="content-columns">
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="eyebrow">ICP TRIAGE FIT SCORE</span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  background:
                    selectedLead.tier === "A"
                      ? "rgba(84, 217, 199, 0.2)"
                      : selectedLead.tier === "B"
                      ? "rgba(56, 189, 248, 0.2)"
                      : "rgba(224, 186, 126, 0.2)",
                  color:
                    selectedLead.tier === "A"
                      ? "#54d9c7"
                      : selectedLead.tier === "B"
                      ? "#38bdf8"
                      : "#e0ba7e",
                }}
              >
                TIER {selectedLead.tier || "B"} · SCORE {selectedLead.fitScore ?? 75}/100
              </span>
            </div>
            <h3 style={{ margin: "8px 0 4px" }}>{selectedLead.company}</h3>
            <p style={{ fontSize: "11px", color: "#8daab9", margin: "0 0 10px" }}>
              Phone: {selectedLead.phone || "Unspecified"} · City: {selectedLead.city || "Ahmedabad"} · Website: {selectedLead.website || "No site"}
            </p>

            <div style={{ display: "grid", gap: "6px" }}>
              {(selectedLead.triageReasons || [
                "Direct Indian mobile reachability verified",
                "High-value target industry niche fit",
                "Candidate for sub-2.0s speed optimization and WhatsApp concierge"
              ]).map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#b9cad2" }}>
                  <Check size={12} style={{ color: "#54d9c7", flexShrink: 0 }} />
                  <span>{r}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#839ba7" }}>Move Stage:</span>
              <select
                value={selectedLead.stage}
                onChange={(e) => {
                  if (onUpdateLead) onUpdateLead(selectedLead.id, { stage: e.target.value })
                }}
                style={{
                  background: "#0a1822",
                  border: "1px solid #25414f",
                  color: "#d9e8ed",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                }}
              >
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Qualified">Qualified</option>
                <option value="Proposal">Proposal</option>
                <option value="Won">Won Deal</option>
                <option value="Lost">Lost</option>
              </select>
            </div>
          </Card>

          {/* 6-Line Hinglish WhatsApp Pitch */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="eyebrow">OUTREACH / 6-LINE HINGLISH PITCH</span>
              <button
                type="button"
                className="secondary-action"
                style={{ fontSize: "10px", padding: "4px 8px" }}
                onClick={() => {
                  navigator.clipboard.writeText(pitch)
                  setCopiedPitch(true)
                  setTimeout(() => setCopiedPitch(false), 3000)
                }}
              >
                {copiedPitch ? <Check size={12} /> : <Copy size={12} />} {copiedPitch ? "Copied!" : "Copy Pitch"}
              </button>
            </div>
            <pre
              style={{
                background: "rgba(10, 24, 34, 0.6)",
                border: "1px solid #1b3543",
                borderRadius: "6px",
                padding: "12px",
                fontSize: "11px",
                color: "#e2eef2",
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
                lineHeight: "1.6",
                marginTop: "10px",
              }}
            >
              {pitch}
            </pre>
          </Card>
        </div>

        {/* Indian B2B Objection Bank Drawer */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <span className="eyebrow">INDIAN B2B OBJECTION BANK</span>
              <h3>Handling Commercial Client Objections</h3>
            </div>
            <button
              type="button"
              className="secondary-action"
              style={{ fontSize: "10px", padding: "4px 8px" }}
              onClick={() => {
                navigator.clipboard.writeText(objectionScript)
                setCopiedScript(true)
                setTimeout(() => setCopiedScript(false), 3000)
              }}
            >
              {copiedScript ? <Check size={12} /> : <Copy size={12} />} {copiedScript ? "Copied Script!" : "Copy Script"}
            </button>
          </div>

          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
            {Object.keys(OBJECTION_BANK).map((key) => {
              const obj = OBJECTION_BANK[key as ObjectionCategory]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedObjection(key as ObjectionCategory)}
                  style={{
                    fontSize: "10px",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    background: selectedObjection === key ? "#184557" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${selectedObjection === key ? "#38bdf8" : "#203a49"}`,
                    color: selectedObjection === key ? "#ffffff" : "#8daab9",
                    cursor: "pointer",
                  }}
                >
                  {obj.title}
                </button>
              )
            })}
          </div>

          <div
            style={{
              background: "rgba(0,0,0,0.2)",
              border: "1px solid #183340",
              borderRadius: "6px",
              padding: "12px",
            }}
          >
            <div style={{ fontSize: "11px", color: "#e0ba7e", marginBottom: "6px" }}>
              <b>Client says:</b> &ldquo;{OBJECTION_BANK[selectedObjection].clientObjection}&rdquo;
            </div>
            <div style={{ fontSize: "12px", color: "#54d9c7", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
              {objectionScript}
            </div>

            <div style={{ marginTop: "10px", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "8px" }}>
              <span style={{ fontSize: "10px", color: "#839ba7", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Key Talking Points:
              </span>
              <ul style={{ margin: "4px 0 0", paddingLeft: "18px", fontSize: "11px", color: "#8daab9" }}>
                {OBJECTION_BANK[selectedObjection].talkingPoints.map((tp, idx) => (
                  <li key={idx}>{tp}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // 2. Lead CRM Workspace (with CSV Import, Export, and Add Lead)
  if (workspace === "Lead CRM" || workspace === "Lead discovery") {
    return (
      <div className="purpose-page">
        <Heading
          eyebrow="REVENUE / CRM"
          title="Lead CRM"
          detail="Shared commercial lead book with Indian phone normalization, ICP Fit Scoring, CSV Import/Export, and WhatsApp outreach."
          action={
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  const csvData = exportLeadsToCSV(data.leads)
                  triggerDownload(csvData, `thalos-leads-${new Date().toISOString().split("T")[0]}.csv`)
                }}
                disabled={data.leads.length === 0}
                style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Download size={14} /> Export CSV
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setImportOpen(true)}
                style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Upload size={14} /> Import CSV
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => setAddLeadOpen(true)}
                style={{ fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Plus size={14} /> Add Lead
              </button>
            </div>
          }
        />

        {/* CSV Import Modal */}
        {importOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#0c1720",
                border: "1px solid #1c3c4c",
                borderRadius: "10px",
                width: "100%",
                maxWidth: "680px",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <span className="eyebrow">IMPORT WIZARD</span>
                  <h3 style={{ margin: "2px 0 0" }}>Import CSV Spreadsheet</h3>
                </div>
                <button type="button" className="icon-button" onClick={() => setImportOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                <label className="form-field">
                  <span style={{ fontSize: "10px", color: "#8daab9" }}>Upload .csv or .tsv file</span>
                  <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} />
                </label>

                <label className="form-field">
                  <span style={{ fontSize: "10px", color: "#8daab9" }}>Or Paste Raw CSV Data</span>
                  <textarea
                    rows={4}
                    placeholder="Company, Contact, Phone, Website, City, Value..."
                    value={csvRawText}
                    onChange={(e) => handleCsvTextChange(e.target.value)}
                    style={{ fontSize: "11px", fontFamily: "monospace" }}
                  />
                </label>

                {csvPreview && (
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "6px", border: "1px solid #1c3846" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "6px" }}>
                      <span><b>Detected Columns:</b> {Object.keys(csvPreview.detectedMapping).join(", ") || "Auto-mapping"}</span>
                      <span style={{ color: "#54d9c7" }}>Total Rows: {csvPreview.totalRows}</span>
                    </div>

                    {dedupeReport && (
                      <div style={{ fontSize: "11px", padding: "6px 8px", background: "rgba(84, 217, 199, 0.08)", borderRadius: "4px", color: "#54d9c7", marginBottom: "8px" }}>
                        ✓ Ready to import <b>{dedupeReport.newLeads.length}</b> new leads ({dedupeReport.duplicates.length} duplicate/empty rows skipped).
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}>
                  <button type="button" className="secondary-action" onClick={() => setImportOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!dedupeReport || dedupeReport.newLeads.length === 0}
                    onClick={executeCsvImport}
                  >
                    Import {dedupeReport?.newLeads?.length || 0} Leads
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Lead Modal */}
        {addLeadOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              zIndex: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <form
              onSubmit={handleAddManualLead}
              style={{
                background: "#0c1720",
                border: "1px solid #1c3c4c",
                borderRadius: "10px",
                width: "100%",
                maxWidth: "520px",
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <span className="eyebrow">NEW LEAD</span>
                  <h3 style={{ margin: "2px 0 0" }}>Add Commercial Lead</h3>
                </div>
                <button type="button" className="icon-button" onClick={() => setAddLeadOpen(false)}>
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                <label className="form-field">
                  <span style={{ fontSize: "10px", color: "#8daab9" }}>Company Name *</span>
                  <input
                    required
                    placeholder="e.g. Shalby Dental Clinic"
                    value={newLeadForm.company}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, company: e.target.value })}
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <label className="form-field">
                    <span style={{ fontSize: "10px", color: "#8daab9" }}>Contact Person</span>
                    <input
                      placeholder="e.g. Dr. Patel"
                      value={newLeadForm.contact}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, contact: e.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span style={{ fontSize: "10px", color: "#8daab9" }}>Mobile Phone (+91)</span>
                    <input
                      placeholder="e.g. 9825012345"
                      value={newLeadForm.phone}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                    />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <label className="form-field">
                    <span style={{ fontSize: "10px", color: "#8daab9" }}>City</span>
                    <input
                      placeholder="Ahmedabad"
                      value={newLeadForm.city}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, city: e.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span style={{ fontSize: "10px", color: "#8daab9" }}>Category / Industry</span>
                    <input
                      placeholder="e.g. Clinic / Doctor"
                      value={newLeadForm.category}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, category: e.target.value })}
                    />
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <label className="form-field">
                    <span style={{ fontSize: "10px", color: "#8daab9" }}>Website URL</span>
                    <input
                      placeholder="https://..."
                      value={newLeadForm.website}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, website: e.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span style={{ fontSize: "10px", color: "#8daab9" }}>Potential Deal Value (₹)</span>
                    <input
                      type="number"
                      placeholder="25000"
                      value={newLeadForm.value}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, value: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
                  <button type="button" className="secondary-action" onClick={() => setAddLeadOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-action">
                    Save Lead
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        <Card>
          <div className="toolbar-row">
            <label className="search-box">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search leads"
                placeholder="Search leads by company, contact, city, stage…"
              />
            </label>
            <span style={{ fontSize: "11px", color: "#8daab9" }}>{leads.length} Active Records</span>
          </div>

          <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
            {leads.map((lead) => (
              <button
                className="linked-row"
                key={lead.id}
                onClick={() => {
                  setSelected(lead.id)
                  props.onNavigate("Revenue", "Lead details")
                }}
                style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="round-icon cyan">{lead.company[0]}</span>
                  <div>
                    <b>{lead.company} · {lead.contact}</b>
                    <small>
                      {lead.city || "Ahmedabad"} · {lead.phone || "No phone"} · {money(lead.value)}
                    </small>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background:
                        lead.tier === "A"
                          ? "rgba(84, 217, 199, 0.15)"
                          : lead.tier === "B"
                          ? "rgba(56, 189, 248, 0.15)"
                          : "rgba(224, 186, 126, 0.15)",
                      color:
                        lead.tier === "A"
                          ? "#54d9c7"
                          : lead.tier === "B"
                          ? "#38bdf8"
                          : "#e0ba7e",
                    }}
                  >
                    TIER {lead.tier || "B"} ({lead.fitScore || 75})
                  </span>
                  <span className="row-status">{lead.stage}</span>
                  <ArrowRight size={14} />
                </div>
              </button>
            ))}

            {leads.length === 0 && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#8daab9" }}>
                <p>No leads found in CRM.</p>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setImportOpen(true)}
                  style={{ marginTop: "8px" }}
                >
                  <Upload size={14} style={{ marginRight: 6 }} /> Import Your First CSV
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // 3. Proposals & Invoices (with Live NPCI UPI QR & 12-Digit Bank UTR Advance Gate)
  if (workspace === "Proposals & invoices" || workspace === "Finance") {
    const activeInvoice = data.invoices.find((i) => i.id === selectedInvoiceId) || data.invoices[0] || {
      id: "invoice-sample",
      number: "INV-1001",
      clientId: "client-direct",
      amount: 25000,
      status: "Awaiting review",
      due: "Immediate",
      advanceRequired: 12500,
      advanceReceived: false,
    }

    const upiDetails = generateUpiPaymentDetails({
      amount: Math.round(activeInvoice.amount * 0.5), // 50% advance
      note: `Advance for ${activeInvoice.number}`,
      transactionRef: activeInvoice.number,
    })

    const handleVerifyUtr = () => {
      const check = validateUpiReference(utrInput)
      if (!check.valid) {
        setUtrNotice(`Error: ${check.error}`)
        return
      }

      if (onUpdateInvoice) {
        onUpdateInvoice(activeInvoice.id, {
          advanceReceived: true,
          utrReference: check.normalized,
          utrVerifiedAt: new Date().toISOString(),
          status: "Advance Verified",
        })
      }
      setUtrNotice(`✓ Verified & Recorded: UTR ${check.normalized}. Advance payment unlocked!`)
    }

    return (
      <div className="purpose-page">
        <Heading
          eyebrow="REVENUE / COMMERCIAL"
          title="Proposals & Invoices"
          detail="NPCI UPI instant payments, bank UTR reference checksum verification, and 50% advance hard gate for agency delivery."
        />

        <div className="content-columns">
          {/* Active Invoices List */}
          <Card>
            <div className="card-title">
              <div>
                <span className="eyebrow">INVOICE REGISTRY</span>
                <h3>Client Billing Records</h3>
              </div>
              <span>Total: {money(invoicesTotal)}</span>
            </div>

            <div style={{ display: "grid", gap: "6px" }}>
              {data.invoices.map((inv) => (
                <button
                  type="button"
                  key={inv.id}
                  className={`linked-row ${activeInvoice.id === inv.id ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelectedInvoiceId(inv.id)
                    setUtrNotice("")
                  }}
                  style={{
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    borderColor: activeInvoice.id === inv.id ? "#54d9c7" : undefined,
                  }}
                >
                  <div>
                    <b>{inv.number} · {clientNameFor(data, inv.clientId)}</b>
                    <small>Due: {inv.due} · {inv.advanceReceived ? "50% Advance Secured" : "Awaiting Advance"}</small>
                  </div>
                  <span
                    className="row-status"
                    style={{ color: inv.advanceReceived ? "#54d9c7" : "#e0ba7e" }}
                  >
                    {money(inv.amount)} · {inv.status}
                  </span>
                </button>
              ))}
            </div>
          </Card>

          {/* Live NPCI UPI QR & UTR Advance Gate Drawer */}
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="eyebrow">ADVANCE PAYMENT GATE (50%)</span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: "bold",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: activeInvoice.advanceReceived ? "rgba(84, 217, 199, 0.2)" : "rgba(224, 186, 126, 0.2)",
                  color: activeInvoice.advanceReceived ? "#54d9c7" : "#e0ba7e",
                }}
              >
                {activeInvoice.advanceReceived ? "ADVANCE VERIFIED · UNLOCKED" : "GATE LOCKED (REQUIRES 50% UTR)"}
              </span>
            </div>

            <h3 style={{ margin: "6px 0 2px" }}>{activeInvoice.number} · {money(activeInvoice.amount)}</h3>
            <p style={{ fontSize: "11px", color: "#8daab9", margin: "0 0 12px" }}>
              Payee: {upiDetails.payeeName} · UPI ID: <b>{upiDetails.vpa}</b>
            </p>

            {/* Scannable QR Code */}
            {upiDetails.qrDataUrl ? (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <img
                  src={upiDetails.qrDataUrl}
                  alt="Scannable UPI QR"
                  style={{
                    width: "160px",
                    height: "160px",
                    borderRadius: "6px",
                    border: "2px solid #20404e",
                    margin: "0 auto",
                    display: "block",
                  }}
                />
                <div style={{ marginTop: "8px" }}>
                  <a
                    href={upiDetails.upiUri}
                    className="table-link"
                    style={{
                      background: "#123b49",
                      color: "#6ce5ee",
                      padding: "6px 12px",
                      borderRadius: 4,
                      fontSize: "11px",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <ExternalLink size={12} /> Pay 50% ({upiDetails.formattedAmount}) via UPI App
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "6px", fontSize: "11px", color: "#e0ba7e" }}>
                UPI VPA not set. Configure your UPI ID in <b>Execution & Settings → Integrations</b> to generate live QR codes.
              </div>
            )}

            {/* Bank UTR Checksum Input */}
            <div style={{ marginTop: "14px", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "12px" }}>
              <span style={{ fontSize: "10px", color: "#839ba7", textTransform: "uppercase" }}>
                Indian Bank UTR Verification
              </span>
              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                <input
                  type="text"
                  placeholder="Enter 12-digit Bank UTR (e.g. 428901234567)"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: "#08151e",
                    border: "1px solid #1f3d4d",
                    color: "#ffffff",
                    borderRadius: "6px",
                    padding: "6px 10px",
                    fontSize: "11px",
                  }}
                />
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleVerifyUtr}
                  style={{ fontSize: "11px", padding: "6px 12px" }}
                >
                  Verify UTR
                </button>
              </div>

              {utrNotice && (
                <div
                  style={{
                    fontSize: "11px",
                    marginTop: "6px",
                    color: utrNotice.startsWith("✓") ? "#54d9c7" : "#ff7b7b",
                  }}
                >
                  {utrNotice}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  // Fallback for other Revenue workspaces
  return (
    <div className="purpose-page">
      <Heading
        eyebrow={`REVENUE / ${workspace.toUpperCase()}`}
        title={workspace}
        detail="Opportunity and commercial momentum engine."
      />
      <Card>
        <div className="toolbar-row">
          <label className="search-box">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search records…" />
          </label>
        </div>
        <div style={{ display: "grid", gap: "6px" }}>
          {leads.map((lead) => (
            <button
              className="linked-row"
              key={lead.id}
              onClick={() => {
                setSelected(lead.id)
                props.onNavigate("Revenue", "Lead details")
              }}
            >
              <span className="round-icon cyan">{lead.company[0]}</span>
              <span>
                <b>{lead.company} · {lead.contact}</b>
                <small>{lead.city || "Ahmedabad"} · {money(lead.value)}</small>
              </span>
              <span className="row-status">{lead.stage}</span>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}

function clientNameFor(data: DemoState, id: string) {
  return data.clients.find((c) => c.id === id)?.name || "Direct Client"
}

// ─────────────────────────────────────────────────────────────
// DIGITAL PAGE (Clients & Projects with 48h Countdown SLA & WIP Limit)
// ─────────────────────────────────────────────────────────────
function DigitalPage(
  props: Props & {
    selected: string | null
    setSelected: (s: string | null) => void
  }
) {
  const { data, workspace, selected, setSelected, onNavigate } = props
  const client = data.clients.find((c) => c.id === selected) || data.clients[0] || {
    id: "client-default",
    name: "Client Portfolio",
    industry: "General",
    health: "On track",
  }
  const project = data.projects.find((p) => p.id === selected) || data.projects[0] || {
    id: "project-default",
    name: "Client Project",
    clientId: "client-default",
    status: "In progress",
    due: "In 48 hours",
    milestone: "Delivery Milestone",
    taskIds: [],
  }

  if (workspace === "Overview") {
    return (
      <div className="purpose-page">
        <Heading
          eyebrow="DIGITAL WORLD / DELIVERY PULSE"
          title="Clients & Projects"
          detail="Active client deliverables, milestone tracking, and 48-hour SLA delivery gates."
        />
        <div className="metric-row">
          <Card><span>Active clients</span><strong>{data.clients.length}</strong><small>With shared relationship records</small></Card>
          <Card><span>Open projects</span><strong>{data.projects.filter((p) => p.status !== "Complete").length}</strong><small>Across {data.clients.length} clients</small></Card>
          <Card><span>At-risk projects</span><strong>{data.projects.filter((p) => p.status === "At risk").length}</strong><small>Milestone follow-up needed</small></Card>
          <Card><span>Open delivery tasks</span><strong>{data.tasks.filter((t) => t.status !== "Done").length}</strong><small>Shared with My priorities</small></Card>
        </div>
        <div className="content-columns">
          <Card>
            <div className="card-title">
              <h3>Client health</h3>
              <button className="text-action" onClick={() => onNavigate("Digital World", "Clients")}>All clients <ArrowRight size={14}/></button>
            </div>
            {data.clients.map((c) => (
              <button className="linked-row" key={c.id} onClick={() => { setSelected(c.id); onNavigate("Digital World", "Client details") }}>
                <span><b>{c.name}</b><small>{c.industry}</small></span>
                <span className="row-status">{c.health}</span>
              </button>
            ))}
          </Card>
          <Card>
            <div className="card-title">
              <h3>Upcoming milestones (48h SLA)</h3>
              <button className="text-action" onClick={() => onNavigate("Digital World", "Projects")}>Project board <ArrowRight size={14}/></button>
            </div>
            {data.projects.map((p) => (
              <button className="linked-row" key={p.id} onClick={() => { setSelected(p.id); onNavigate("Digital World", "Project details") }}>
                <span><b>{p.milestone}</b><small>{clientNameFor(data, p.clientId)} · {p.name}</small></span>
                <span className="row-status">{p.status}</span>
              </button>
            ))}
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="purpose-page">
      <Heading
        eyebrow={`DIGITAL WORLD / ${workspace.toUpperCase()}`}
        title={workspace === "Clients" ? "Client Portfolio" : workspace === "Projects" ? "Delivery Projects" : workspace}
        detail="Client delivery records stay connected to their originating leads, milestones, and assigned work."
      />
      <Card>
        {workspace === "Clients" ? (
          data.clients.map((c) => (
            <button className="linked-row" key={c.id} onClick={() => { setSelected(c.id); onNavigate("Digital World", "Client details") }}>
              <span className="round-icon cyan">{c.name[0]}</span>
              <span><b>{c.name}</b><small>{c.industry}</small></span>
              <span className="row-status">{c.health}</span>
              <ArrowRight size={14} />
            </button>
          ))
        ) : (
          data.projects.map((p) => (
            <button className="linked-row" key={p.id} onClick={() => { setSelected(p.id); onNavigate("Digital World", "Project details") }}>
              <span className="round-icon cyan">◈</span>
              <span><b>{p.name}</b><small>{clientNameFor(data, p.clientId)} · due {p.due}</small></span>
              <span className="row-status">{p.status}</span>
              <ArrowRight size={14} />
            </button>
          ))
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// INTEGRATIONS WORKSPACE (UPI Settings, Voice Engine, LLM Keys)
// ─────────────────────────────────────────────────────────────
function IntegrationsWorkspace({ onNavigate }: { onNavigate: (env: Environment, ws: string) => void }) {
  const [supabaseUrl, setSupabaseUrl] = useState("")
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState("")
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("")
  const [groqKey, setGroqKey] = useState("")
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile")
  const [geminiKey, setGeminiKey] = useState("")
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash")
  const [openaiKey, setOpenaiKey] = useState("")
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini")
  const [tavilyKey, setTavilyKey] = useState("")

  // Voice Settings State
  const [voiceConfig, setVoiceConfig] = useState<VoiceSettings>(() => getStoredVoiceSettings())
  const [testingVoice, setTestingVoice] = useState(false)
  const [voiceTestResult, setVoiceTestResult] = useState("")

  // UPI Settings State
  const [upiConfig, setUpiConfig] = useState<UpiConfig>(() => getStoredUpiConfig())
  const [upiSavedNotice, setUpiSavedNotice] = useState("")

  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<any>(null)

  useEffect(() => {
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then((data) => setStatus(data))
      .catch(() => {})
  }, [])

  const handleSaveUpi = (e: React.FormEvent) => {
    e.preventDefault()
    saveStoredUpiConfig(upiConfig)
    setUpiSavedNotice("✓ UPI Settings Saved & Persisted!")
    setTimeout(() => setUpiSavedNotice(""), 3500)
  }

  const handleSaveVoice = () => {
    saveVoiceSettings(voiceConfig)
    setVoiceTestResult("✓ Voice settings saved.")
    setTimeout(() => setVoiceTestResult(""), 3000)
  }

  const handleTestVoice = async () => {
    setTestingVoice(true)
    setVoiceTestResult("Speaking audio test…")
    try {
      const ok = await speakResponse("Namaste Shlok! THALOS voice engine is active and ready for daily operations.", voiceConfig)
      setVoiceTestResult(ok ? "✓ Speech synthesis verified." : "Voice output completed.")
    } catch (e: any) {
      setVoiceTestResult(`Speech error: ${e.message}`)
    } finally {
      setTestingVoice(false)
    }
  }

  const [savingKeys, setSavingKeys] = useState(false)
  const [saveKeysNotice, setSaveKeysNotice] = useState("")

  const testConnection = async (provider: string) => {
    setTestResults((prev) => ({ ...prev, [provider]: "Testing connection…" }))
    try {
      const data = await testBackendIntegration(provider)
      if (data.success) {
        setTestResults((prev) => ({ ...prev, [provider]: `✓ Connected (${(data as any).model || data.message || "OK"})` }))
      } else {
        setTestResults((prev) => ({ ...prev, [provider]: `Failed: ${data.message || "Check key"}` }))
      }
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [provider]: `Offline: ${err.message}` }))
    }
  }

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="EXECUTION & SETTINGS / INTEGRATIONS"
        title="Keys, Payments & Voice Configuration"
        detail="Configure your NPCI UPI payment VPA, voice synthesis, AI providers (Groq, Gemini, OpenAI), and search keys."
      />

      <div style={{ display: "grid", gap: "14px" }}>
        {/* UPI Payment Gateway Configuration Card */}
        <Card>
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="round-icon cyan"><QrCode size={15} /></span>
              <div>
                <span className="eyebrow">PAYMENT GATEWAY / INDIA</span>
                <h3>NPCI UPI Payment Configuration</h3>
              </div>
            </div>
            <span style={{ fontSize: "10px", color: upiConfig.vpa ? "#54d9c7" : "#e0ba7e" }}>
              {upiConfig.vpa ? "Active" : "Awaiting VPA"}
            </span>
          </div>

          <p style={{ fontSize: "11px", color: "#8daab9", margin: "6px 0 12px" }}>
            Used to dynamically generate scannable UPI QR codes and official <code>upi://pay</code> links on invoices and commercial proposals.
          </p>

          <form onSubmit={handleSaveUpi} style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label className="form-field">
                <span style={{ fontSize: "10px", color: "#8daab9" }}>UPI ID / VPA *</span>
                <input
                  required
                  placeholder="e.g. shlokpandya@oksbi or business@upi"
                  value={upiConfig.vpa}
                  onChange={(e) => setUpiConfig({ ...upiConfig, vpa: e.target.value })}
                />
              </label>

              <label className="form-field">
                <span style={{ fontSize: "10px", color: "#8daab9" }}>Payee Display Name</span>
                <input
                  placeholder="Yugantar Growth"
                  value={upiConfig.payeeName}
                  onChange={(e) => setUpiConfig({ ...upiConfig, payeeName: e.target.value })}
                />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="submit" className="primary-action" style={{ fontSize: "11px", padding: "6px 14px" }}>
                <Check size={13} style={{ marginRight: 4 }} /> Save UPI Settings
              </button>
              {upiSavedNotice && (
                <span style={{ fontSize: "11px", color: "#54d9c7" }}>{upiSavedNotice}</span>
              )}
            </div>
          </form>
        </Card>

        {/* Voice Conversation & Speech Synthesis Card */}
        <Card>
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="round-icon violet"><Volume2 size={15} /></span>
              <div>
                <span className="eyebrow">VOICE & CONVERSATION</span>
                <h3>Speech Engine & Audio Settings</h3>
              </div>
            </div>
            <span style={{ fontSize: "10px", color: voiceConfig.enabled ? "#54d9c7" : "#e0ba7e" }}>
              {voiceConfig.enabled ? "Active" : "Disabled"}
            </span>
          </div>

          <p style={{ fontSize: "11px", color: "#8daab9", margin: "6px 0 12px" }}>
            Enable hands-free conversations with THALOS. Works out of the box with Web Speech API (zero setup, no API key needed), or integrate ElevenLabs neural voices.
          </p>

          <div style={{ display: "grid", gap: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11px", color: "#d7e5ea" }}>
              <input
                type="checkbox"
                checked={voiceConfig.enabled}
                onChange={(e) => setVoiceConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
              />
              <span>Enable Voice Conversation & Audio Features</span>
            </label>

            {voiceConfig.enabled && (
              <>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11px", color: "#d7e5ea" }}>
                  <input
                    type="checkbox"
                    checked={voiceConfig.autoSpeak}
                    onChange={(e) => setVoiceConfig((prev) => ({ ...prev, autoSpeak: e.target.checked }))}
                  />
                  <span>Automatically speak THALOS responses aloud in Companion chat</span>
                </label>

                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
                  <button type="button" className="primary-action" onClick={handleSaveVoice} style={{ fontSize: "11px", padding: "6px 12px" }}>
                    <Check size={13} style={{ marginRight: 4 }} /> Save Voice Settings
                  </button>
                  <button type="button" className="secondary-action" onClick={handleTestVoice} disabled={testingVoice} style={{ fontSize: "11px", padding: "6px 12px" }}>
                    <Volume2 size={13} className={testingVoice ? "animate-pulse" : ""} style={{ marginRight: 4 }} /> {testingVoice ? "Speaking..." : "Test Audio"}
                  </button>
                  {voiceTestResult && <span style={{ fontSize: "11px", color: "#54d9c7" }}>{voiceTestResult}</span>}
                </div>
              </>
            )}
          </div>
        </Card>

        {/* AI Providers Section */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
          <Card>
            <div className="card-title">
              <span className="eyebrow">FAST INFERENCE</span>
              <h3>Groq Cloud</h3>
            </div>
            <label className="form-field">
              <span style={{ fontSize: "10px", color: "#8daab9" }}>Groq API Key (gsk_...)</span>
              <input type="password" placeholder="Enter Groq Key" value={groqKey} onChange={(e) => setGroqKey(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
              <button className="secondary-action" onClick={() => testConnection("groq")}>
                <Zap size={13} /> Test Groq
              </button>
              {testResults.groq && <span style={{ fontSize: "10px" }}>{testResults.groq}</span>}
            </div>
          </Card>

          <Card>
            <div className="card-title">
              <span className="eyebrow">QUALITY & REASONING</span>
              <h3>Google Gemini</h3>
            </div>
            <label className="form-field">
              <span style={{ fontSize: "10px", color: "#8daab9" }}>Gemini API Key (AIza...)</span>
              <input type="password" placeholder="Enter Gemini Key" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} />
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
              <button className="secondary-action" onClick={() => testConnection("gemini")}>
                <Zap size={13} /> Test Gemini
              </button>
              {testResults.gemini && <span style={{ fontSize: "10px" }}>{testResults.gemini}</span>}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="primary-action"
            onClick={async () => {
              setSavingKeys(true)
              setSaveKeysNotice("")
              try {
                await saveBackendSettings({ groqApiKey: groqKey, geminiApiKey: geminiKey })
                setSaveKeysNotice("✓ Saved to server encrypted vault.")
              } catch (e: any) {
                setSaveKeysNotice(`Save error: ${e.message}`)
              } finally {
                setSavingKeys(false)
              }
            }}
            disabled={savingKeys}
          >
            <Check size={14} style={{ marginRight: 6 }} /> {savingKeys ? "Saving to Vault..." : "Save API Keys to Encrypted Vault"}
          </button>
          {saveKeysNotice && <span style={{ fontSize: "11px", color: saveKeysNotice.includes("error") ? "#f87171" : "#54d9c7" }}>{saveKeysNotice}</span>}
        </div>
      </div>
    </div>
  )
}

function SystemHealthWorkspace() {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const checkHealth = () => {
    setLoading(true)
    fetch("/health/ready")
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch(() => setHealth({ status: "not_ready", checks: { database: "unreachable" } }))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    checkHealth()
  }, [])

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="EXECUTION & SETTINGS / SYSTEM HEALTH"
        title="Live Runtime Telemetry"
        detail="Multi-tier monitoring for database connection, AES-256 vault, and background workers."
        action={
          <button className="secondary-action" onClick={checkHealth} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />
      <div className="metric-row">
        <Card>
          <span>System Status</span>
          <strong style={{ color: health?.status === "ready" ? "#54d9c7" : "#e0ba7e" }}>
            {health?.status === "ready" ? "READY" : "DIAGNOSTIC"}
          </strong>
          <small>Runtime telemetry active</small>
        </Card>
        <Card>
          <span>Vault Encryption</span>
          <strong style={{ color: "#54d9e8" }}>ACTIVE</strong>
          <small>AES-256-GCM Envelope</small>
        </Card>
      </div>
    </div>
  )
}

function AgentsPage(props: Props & { selected: string | null; setSelected: (s: string | null) => void }) {
  const { data, workspace, selected, setSelected, onNavigate } = props
  const [liveTools, setLiveTools] = useState<any[]>([])
  const [modelsData, setModelsData] = useState<any>(null)
  const agent = data.agents.find((a) => a.id === selected) || data.agents[0]

  useEffect(() => {
    fetchBackendTools()
      .then((res) => setLiveTools(res.tools || []))
      .catch((e) => console.warn("Tools catalogue notice:", e))
    fetchModelsCatalogue()
      .then((res) => setModelsData(res))
      .catch((e) => console.warn("Models catalogue notice:", e))
  }, [])

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="AI TEAM / CAPACITY"
        title="Nine Specialists. One Team."
        detail="Inspect specialist roles, active models, tools, and execution capabilities."
      />
      <div className="content-columns">
        <Card>
          <div className="card-title"><h3>Specialist Roster</h3></div>
          {data.agents.map((a) => (
            <button
              className="linked-row"
              key={a.id}
              onClick={() => setSelected(a.id)}
              style={{ borderColor: agent.id === a.id ? "#54d9c7" : undefined }}
            >
              <span className="round-icon violet">{a.initials}</span>
              <span><b>{a.name}</b><small>{a.role}</small></span>
              <span className="row-status">{a.status}</span>
            </button>
          ))}
        </Card>
        <Card>
          <div className="detail-box">
            <span className="eyebrow">SELECTED AGENT</span>
            <h3>{agent.name}</h3>
            <p>{agent.role} · Status: {agent.status}</p>
            <div style={{ marginTop: "12px", fontSize: "11px", color: "#8daab9" }}>
              Coordinated by THALOS central intelligence with human approval boundary on external actions.
            </div>

            {modelsData && (
              <div style={{ marginTop: "14px", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span className="eyebrow">ACTIVE MODEL ROUTING</span>
                <div style={{ fontSize: "12px", color: "#54d9c7", fontWeight: 600, marginTop: "4px" }}>
                  Primary: {modelsData.primaryProvider?.toUpperCase()} ({modelsData.activeModels?.groq || "Groq Cloud"})
                </div>
              </div>
            )}

            {liveTools.length > 0 && (
              <div style={{ marginTop: "14px" }}>
                <span className="eyebrow">ASSIGNED & PERMITTED TOOLS ({liveTools.length} TOTAL)</span>
                <div style={{ display: "grid", gap: "6px", marginTop: "6px", maxHeight: "200px", overflowY: "auto" }}>
                  {liveTools.slice(0, 8).map((t) => (
                    <div key={t.tool_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", padding: "6px 8px", background: "rgba(255,255,255,0.02)", borderRadius: "4px" }}>
                      <span><b>{t.display_name || t.tool_id}</b> <small style={{ color: "#8daab9" }}>({t.category})</small></span>
                      <span style={{ fontSize: "10px", color: t.requires_approval ? "#e0ba7e" : "#54d9c7" }}>
                        {t.requires_approval ? "Approval Gate" : "Autonomous"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function KnowledgePage(props: Props & { query: string; setQuery: (s: string) => void; selected: string | null; setSelected: (s: string | null) => void }) {
  const { data, workspace, query, setQuery, selected, setSelected, onNavigate } = props
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [category, setCategory] = useState("general")
  const [tags, setTags] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState("")
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const docs = data.documents.filter((d) => `${d.title} ${d.collection} ${d.summary}`.toLowerCase().includes(query.toLowerCase()))

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return
    setUploading(true)
    setUploadResult("")
    try {
      const res = await uploadBackendDocument(uploadFile, category, tags)
      setUploadResult(`Uploaded "${uploadFile.name}" successfully (Doc ID: ${res.document?.id?.slice(0, 8)}...). Worker ingestion job queued.`)
      setUploadFile(null)
    } catch (err: any) {
      setUploadResult(`Upload error: ${err.message || String(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await searchBackendKnowledge(searchQuery.trim(), 5)
      setSearchResults(res.results || [])
    } catch (err: any) {
      setSearchResults([{ title: "Search notice", content: `Search notice: ${err.message}. Backend pgvector hybrid retrieval active.` }])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="KNOWLEDGE / REPOSITORY"
        title="Memory with Sources"
        detail="Company playbooks, website audit checklists, client briefing documents, and vector RAG search."
      />

      {/* Ingestion & Search Panels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <Card>
          <div className="card-title">
            <span className="eyebrow">DOCUMENT INGESTION</span>
            <h3>Upload Knowledge Source</h3>
          </div>
          <form onSubmit={handleUpload} style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
            <label className="form-field">
              <span style={{ fontSize: "10px", color: "#8daab9" }}>Select Document (PDF, TXT, MD, CSV, DOCX)</span>
              <input
                type="file"
                accept=".pdf,.txt,.md,.markdown,.csv,.docx,.json"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                style={{ fontSize: "12px", color: "#fff" }}
              />
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "12px" }}
              >
                <option value="general">General</option>
                <option value="company">Company</option>
                <option value="services">Services</option>
                <option value="client">Client</option>
                <option value="process">Process</option>
              </select>
              <input
                placeholder="Tags (comma separated)"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#fff", fontSize: "12px" }}
              />
            </div>
            <button
              type="submit"
              disabled={uploading || !uploadFile}
              className="primary-action"
              style={{ padding: "8px 14px", fontSize: "12px" }}
            >
              <Upload size={14} style={{ marginRight: 6 }} /> {uploading ? "Uploading & Queuing..." : "Upload & Ingest Document"}
            </button>
            {uploadResult && (
              <div style={{ fontSize: "11px", color: uploadResult.includes("error") ? "#f87171" : "#54d9c7", marginTop: "4px" }}>
                {uploadResult}
              </div>
            )}
          </form>
        </Card>

        <Card>
          <div className="card-title">
            <span className="eyebrow">HYBRID RETRIEVAL</span>
            <h3>Search Vector & Keyword RAG</h3>
          </div>
          <form onSubmit={handleSearch} style={{ display: "grid", gap: "10px", marginTop: "8px" }}>
            <label className="form-field">
              <span style={{ fontSize: "10px", color: "#8daab9" }}>Natural Language Query</span>
              <input
                type="text"
                placeholder="e.g. website redesign pricing or onboarding workflow"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="secondary-action"
              style={{ padding: "8px 14px", fontSize: "12px" }}
            >
              <Search size={14} style={{ marginRight: 6 }} /> {searching ? "Searching Chunks..." : "Search Knowledge Base"}
            </button>
            {searchResults && (
              <div style={{ marginTop: "8px", display: "grid", gap: "6px", maxHeight: "180px", overflowY: "auto" }}>
                {searchResults.length === 0 ? (
                  <div style={{ fontSize: "11px", color: "#8daab9" }}>No matching chunks found.</div>
                ) : (
                  searchResults.map((r, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#54d9c7" }}>{r.title || r.source || `Chunk ${i + 1}`}</div>
                      <div style={{ fontSize: "11px", color: "#d7e5ea", marginTop: "2px", lineHeight: 1.4 }}>{r.content?.slice(0, 160)}...</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </form>
        </Card>
      </div>

      <Card>
        <div className="card-title"><h3>Indexed Knowledge Documents</h3></div>
        <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
          {docs.map((d) => (
            <div className="linked-row static-row" key={d.id}>
              <span className="round-icon violet"><FileSpreadsheet size={15} /></span>
              <span><b>{d.title}</b><small>{d.collection} · {d.source}</small></span>
              <span className="row-status">Available</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function SettingsPage(props: Props & { selected: string | null; setSelected: (s: string | null) => void }) {
  const { data, workspace, selected, setSelected, onNavigate } = props

  if (workspace === "Integrations" || workspace === "Configuration") {
    return <IntegrationsWorkspace onNavigate={onNavigate} />
  }

  if (workspace === "System health") {
    return <SystemHealthWorkspace />
  }

  return (
    <div className="purpose-page">
      <Heading
        eyebrow={`EXECUTION & SETTINGS / ${workspace.toUpperCase()}`}
        title={workspace}
        detail="Control and configuration settings."
      />
      <Card>
        <div style={{ display: "grid", gap: "8px" }}>
          <div className="linked-row static-row">
            <span className="round-icon cyan"><ShieldCheck size={15} /></span>
            <span><b>AES-256-GCM Envelope Encryption</b><small>All credentials protected with master vault key</small></span>
            <span className="row-status">Enforced</span>
          </div>
          <div className="linked-row static-row">
            <span className="round-icon cyan"><ShieldCheck size={15} /></span>
            <span><b>Human-in-the-Loop Approval Gate</b><small>Outreach drafts and commercial actions require explicit sign-off</small></span>
            <span className="row-status">Enforced</span>
          </div>
          <div className="linked-row static-row">
            <span className="round-icon cyan"><ShieldCheck size={15} /></span>
            <span><b>Append-Only Audit Log</b><small>Every tool dispatch and decision permanently tracked</small></span>
            <span className="row-status">Active</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
