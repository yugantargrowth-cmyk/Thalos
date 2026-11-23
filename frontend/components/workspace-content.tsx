"use client"

import { useEffect, useMemo, useState } from "react"
import type { Approval, ApprovalStatus, DemoState, Environment, Operation, OperationStatus, Task, TaskStatus } from "@/lib/thalos-data"
import { Activity, AlertTriangle, ArrowRight, Check, CheckCircle2, Circle, Clock3, Cpu, Database, ExternalLink, Key, Mic, Plus, RefreshCw, Search, Send, ShieldCheck, Sparkles, Volume2, X, Zap } from "lucide-react"
import { getStoredVoiceSettings, saveVoiceSettings, speakResponse, DEFAULT_VOICE_SETTINGS, type VoiceSettings } from "@/lib/voice"

type Props = { environment: Environment; workspace: string; data: DemoState; selectedRecord: string | null; onSelectRecord: (id: string | null) => void; onTask: (id: string, status: TaskStatus) => void; onEditTask: (id: string, title: string) => void; onApproval: (id: string, status: ApprovalStatus) => void; onOperation: (id: string, status: OperationStatus) => void; onCreateTask: (title: string) => void; onNavigate: (environment: Environment, workspace: string) => void }
const money = (value: number) => `$${value.toLocaleString()}`
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => <section className={`workspace-card ${className}`}>{children}</section>
const Heading = ({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: React.ReactNode }) => <div className="view-heading"><div><span className="eyebrow">{eyebrow} · DEMO DATA</span><h2>{title}</h2><p>{detail}</p></div>{action}</div>
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
  const taskMatches = (task: Task) => `${task.title} ${projectName(task.projectId)} ${task.assignee} ${AgentName({ data, id: task.agentId })}`.toLowerCase().includes(query.toLowerCase())

  if (environment === "My Day" && workspace === "Overview") return <div className="purpose-page">
    <Heading eyebrow="MONDAY BRIEFING / APRIL 28" title="Your business, in focus." detail="A daily command chamber: decisions to make, work in motion, and the next best actions." />
    <div className="metric-row"><Card><span>Pipeline in view</span><strong>{money(data.deals.reduce((n, d) => n + d.amount, 0))}</strong><small>4 linked opportunities</small></Card><Card><span>Priorities</span><strong>{data.tasks.filter((t) => t.status !== "Done").length}</strong><small>1 blocked · 1 urgent</small></Card><Card><span>Needs approval</span><strong>{data.approvals.filter((a) => a.status === "Pending").length}</strong><small>Client-facing and access requests</small></Card><Card><span>Agent activity</span><strong>{data.operations.filter((o) => o.status === "Running").length} active</strong><small>Across {data.agents.length} specialists</small></Card></div>
    <div className="content-columns"><Card><div className="card-title"><div><span className="eyebrow">FIRST THINGS FIRST</span><h3>Today&apos;s priorities</h3></div><button className="text-action" onClick={() => props.onNavigate("My Day", "My priorities")}>Open queue <ArrowRight size={14}/></button></div>{data.tasks.filter((t) => t.status !== "Done").slice(0, 3).map((t) => <button className="linked-row" key={t.id} onClick={() => { props.onNavigate("My Day", "My priorities"); setSelected(t.id) }}><span className={`priority-mark ${t.priority.toLowerCase()}`}/><span><b>{t.title}</b><small>{projectName(t.projectId)} · {t.due} · {AgentName({ data, id: t.agentId })}</small></span><span className="row-status">{t.status}</span></button>)}</Card>
      <Card><div className="card-title"><div><span className="eyebrow">DECISIONS</span><h3>Approval summary</h3></div><button className="text-action" onClick={() => props.onNavigate("My Day", "Approvals")}>Review all <ArrowRight size={14}/></button></div>{data.approvals.filter((a) => a.status === "Pending").map((a) => <button className="linked-row" key={a.id} onClick={() => { props.onNavigate("My Day", "Approvals"); setSelected(a.id) }}><span className="round-icon amber"><ShieldCheck size={15}/></span><span><b>{a.title}</b><small>{AgentName({ data, id: a.agentId })} · {a.impact}</small></span><ArrowRight size={15}/></button>)}{!data.approvals.some((a) => a.status === "Pending") && <Empty text="No decisions are waiting."/>}</Card>
      <Card><div className="card-title"><div><span className="eyebrow">EXECUTION PULSE</span><h3>Agents at work</h3></div><button className="text-action" onClick={() => props.onNavigate("My Day", "Active operations")}>Monitor <ArrowRight size={14}/></button></div>{data.operations.filter((o) => ["Running", "Queued", "Blocked"].includes(o.status)).slice(0, 3).map((o) => <OperationRow key={o.id} operation={o} data={data}/>)}</Card>
      <Card><div className="card-title"><div><span className="eyebrow">UP NEXT</span><h3>Deadlines & next actions</h3></div></div>{data.projects.slice(0, 3).map((p) => <button className="linked-row" key={p.id} onClick={() => props.onNavigate("Digital World", "Projects")}><span className="round-icon cyan"><Clock3 size={15}/></span><span><b>{p.milestone}</b><small>{clientName(p.clientId)} · project milestone</small></span><span className="row-status">{p.status}</span></button>)}</Card><Card><div className="card-title"><div><span className="eyebrow">RECENT AGENT ACTIVITY</span><h3>Work, with a trace</h3></div></div>{data.activities.map((a) => <div className="linked-row static-row" key={a.id}><span className="round-icon violet">{AgentName({ data, id: a.agentId })[0]}</span><span><b>{AgentName({ data, id: a.agentId })} {a.action}</b><small>{a.detail} · {a.timestamp} · linked record {a.recordId}</small></span></div>)}</Card></div>
  </div>

  if (environment === "My Day" && workspace === "My priorities") return <div className="purpose-page">
    <Heading eyebrow="PERSONAL WORK QUEUE" title="My priorities" detail="Your task list is linked to real demo projects and their assigned agents. Status changes flow into the delivery workspace." action={<button className="primary-action" onClick={() => { const title = draft.trim() || "New priority"; props.onCreateTask(title); setDraft("") }}><Plus size={15}/> Add task</button>} />
    <Card><div className="toolbar-row"><label className="search-box"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks, projects, assignees" aria-label="Search tasks"/></label><select aria-label="Filter tasks" value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option><option>Open</option><option>In progress</option><option>Blocked</option><option>Done</option></select><div className="segmented"><button aria-pressed={view === "List"} className={view === "List" ? "chosen" : ""} onClick={() => setView("List")}>List</button><button aria-pressed={view === "Board"} className={view === "Board" ? "chosen" : ""} onClick={() => setView("Board")}>Board</button></div></div>
      <form className="inline-create" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) props.onCreateTask(draft.trim()); setDraft("") }}><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault() }} placeholder="Add a task to the demo queue…" aria-label="New task title"/><button type="submit" className="secondary-action"><Plus size={14}/> Create</button></form>
      {view === "List" ? <div className="task-table">{data.tasks.filter(taskMatches).filter((t) => filter === "All" || t.status === filter).map((t) => <TaskRow key={t.id} task={t} data={data} selected={selected === t.id} onSelect={() => setSelected(selected === t.id ? null : t.id)} onTask={props.onTask}/>)}</div> : <div className="task-board">{(["Open", "In progress", "Blocked", "Done"] as TaskStatus[]).map((status) => <div className="board-column" key={status}><h3>{status}<span>{data.tasks.filter((t) => t.status === status).length}</span></h3>{data.tasks.filter((t) => t.status === status && taskMatches(t)).map((t) => <button className="board-task" key={t.id} onClick={() => setSelected(selected === t.id ? null : t.id)}><b>{t.title}</b><small>{projectName(t.projectId)} · {t.due}</small><span>{t.priority} · {AgentName({ data, id: t.agentId })}</span></button>)}</div>)}</div>}
      {selected && data.tasks.find((t) => t.id === selected) && <TaskDetail key={selected} task={data.tasks.find((t) => t.id === selected)!} data={data} onTask={props.onTask} onEditTask={props.onEditTask}/>}
      {data.tasks.filter(taskMatches).filter((t) => filter === "All" || t.status === filter).length === 0 && <Empty text="No tasks match these filters. Adjust the search or status."/>}
    </Card>
  </div>

  if ((environment === "My Day" && workspace === "Approvals") || (environment === "Execution & Settings" && workspace === "Approvals")) return <ApprovalsPage data={data} onApproval={props.onApproval}/>
  if ((environment === "My Day" && workspace === "Active operations") || (environment === "Execution & Settings" && workspace === "Operations")) return <OperationsPage data={data} onOperation={props.onOperation}/>

  if (environment === "Digital World" && workspace === "Tasks") return <div className="purpose-page"><Heading eyebrow="DELIVERY / TASKS" title="Project delivery tasks" detail="Tasks are the same shared records shown in My priorities, organized by client project."/><Card>{data.tasks.map((t) => <TaskRow key={t.id} task={t} data={data} selected={selected === t.id} onSelect={() => setSelected(selected === t.id ? null : t.id)} onTask={props.onTask}/>)}</Card></div>

  if (environment === "Revenue" && ["Lead CRM", "Lead discovery", "Lead details", "Sales pipeline", "Outreach studio", "Communication centre", "Proposals & invoices", "Finance", "Revenue intelligence", "Overview"].includes(workspace)) return <RevenueWorkspace {...props} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected}/>
  if (environment === "Digital World" && ["Clients", "Client details", "Projects", "Project details", "Services", "Assets", "Support", "Overview"].includes(workspace)) return <DigitalPage {...props} selected={selected} setSelected={setSelected}/>
  if (environment === "AI Team") return <AgentsPage {...props} selected={selected} setSelected={setSelected}/>
  if (environment === "Knowledge") return <KnowledgePage {...props} query={query} setQuery={setQuery} selected={selected} setSelected={setSelected}/>
  return <SettingsPage {...props} selected={selected} setSelected={setSelected}/>
}

function Empty({ text }: { text: string }) { return <div className="empty-state"><Circle size={17}/><p>{text}</p></div> }
function TaskRow({ task, data, selected, onSelect, onTask }: { task: Task; data: DemoState; selected: boolean; onSelect: () => void; onTask: Props["onTask"] }) { return <div className={`task-item ${selected ? "is-selected" : ""}`}><button className="task-select" onClick={onSelect}><span className={`task-check ${task.status === "Done" ? "is-done" : ""}`}>{task.status === "Done" && <Check size={12}/>}</span><span><b>{task.title}</b><small>{data.projects.find((p) => p.id === task.projectId)?.name} · {task.due} · {AgentName({ data, id: task.agentId })}</small></span></button><span className={`priority-tag ${task.priority.toLowerCase()}`}>{task.priority}</span><select aria-label={`Status for ${task.title}`} value={task.status} onChange={(e) => onTask(task.id, e.target.value as TaskStatus)}><option>Open</option><option>In progress</option><option>Blocked</option><option>Done</option></select></div> }
function TaskDetail({ task, data, onTask, onEditTask }: { task: Task; data: DemoState; onTask: Props["onTask"]; onEditTask: Props["onEditTask"] }) { const [editing, setEditing] = useState(false); const [title, setTitle] = useState(task.title); return <div className="detail-box"><span className="eyebrow">TASK DETAILS · {task.id}</span>{editing ? <label className="form-field">Task title<input aria-label="Edit task title" value={title} onChange={(e) => setTitle(e.target.value)}/></label> : <h3>{task.title}</h3>}<p>{task.description}</p><div className="detail-meta"><span>Project: {data.projects.find((p) => p.id === task.projectId)?.name}</span><span>Assignee: {task.assignee}</span><span>Agent: {AgentName({ data, id: task.agentId })}</span><span>Due: {task.due}</span></div><div className="approval-buttons">{editing ? <button className="primary-action" onClick={() => { if (title.trim()) onEditTask(task.id, title.trim()); setEditing(false) }}>Save task</button> : <button className="secondary-action" onClick={() => setEditing(true)}>Edit task</button>}<button className="secondary-action" onClick={() => onTask(task.id, task.status === "Done" ? "Open" : "Done")}>{task.status === "Done" ? "Reopen task" : "Mark complete"}</button></div></div> }
function OperationRow({ operation, data }: { operation: Operation; data: DemoState }) { return <div className="operation-row"><span className={`operation-mark ${operation.status.toLowerCase()}`}/><div><b>{operation.name}</b><small>{AgentName({ data, id: operation.agentId })} · {operation.stage}</small></div><span className="row-status">{operation.status}{operation.status === "Running" ? ` · ${operation.progress}%` : ""}</span></div> }
function ApprovalsPage({ data, onApproval }: { data: DemoState; onApproval: Props["onApproval"] }) { const [tab, setTab] = useState("Pending"); const rows = tab === "Pending" ? data.approvals.filter((a) => a.status === "Pending") : data.approvalHistory; return <div className="purpose-page"><Heading eyebrow="APPROVAL CENTRE" title="Decisions, with context." detail="Review the requested action, rationale, risk, and linked records before choosing an outcome."/><Card><div className="segmented approval-tabs"><button aria-pressed={tab === "Pending"} className={tab === "Pending" ? "chosen" : ""} onClick={() => setTab("Pending")}>Pending <span>{data.approvals.filter((a) => a.status === "Pending").length}</span></button><button aria-pressed={tab === "History"} className={tab === "History" ? "chosen" : ""} onClick={() => setTab("History")}>History <span>{data.approvalHistory.length}</span></button></div>{rows.map((a) => <ApprovalCard key={a.id} approval={a} data={data} onApproval={onApproval}/>) }{rows.length === 0 && <Empty text={tab === "Pending" ? "No pending requests. Decisions will appear here." : "No decision history yet. Resolve a pending request to create history."}/>}</Card></div> }
function ApprovalCard({ approval, data, onApproval }: { approval: Approval; data: DemoState; onApproval: Props["onApproval"] }) { return <article className="approval-record"><div className="record-topline"><span className="round-icon amber"><ShieldCheck size={16}/></span><span className="row-status">{approval.status}</span><small>{approval.created}</small></div><h3>{approval.title}</h3><p className="approval-action-line"><b>Requested action:</b> {approval.action}</p><div className="approval-context-grid"><div><span>REQUESTING AGENT</span><b>{AgentName({ data, id: approval.agentId })}</b></div><div><span>WHY NOW</span><b>{approval.reason}</b></div><div><span>IMPACT</span><b>{approval.impact}</b></div><div><span>RISK</span><b>{approval.risk}</b></div></div><p>{approval.context}</p>{approval.status === "Pending" && <div className="approval-buttons"><button className="primary-action" onClick={() => onApproval(approval.id, "Approved")}><Check size={14}/> Approve</button><button className="secondary-action" onClick={() => onApproval(approval.id, "Changes requested")}>Request changes</button><button className="danger-action" onClick={() => onApproval(approval.id, "Rejected")}><X size={14}/> Reject</button></div>}</article> }
function OperationsPage({ data, onOperation }: { data: DemoState; onOperation: Props["onOperation"] }) { const [tab, setTab] = useState("Live"); const active = data.operations.filter((o) => ["Running", "Queued", "Blocked", "Failed"].includes(o.status)); const rows = tab === "Live" ? active : data.operations.filter((o) => ["Completed", "Cancelled"].includes(o.status)); return <div className="purpose-page"><Heading eyebrow="EXECUTION MONITOR" title="Every run, accounted for." detail="Track live stages, owner agents, timestamps, blockers, and failures. Demo controls only change local prototype state."/><Card><div className="segmented approval-tabs"><button className={tab === "Live" ? "chosen" : ""} aria-pressed={tab === "Live"} onClick={() => setTab("Live")}>Live & queued <span>{active.length}</span></button><button className={tab === "History" ? "chosen" : ""} aria-pressed={tab === "History"} onClick={() => setTab("History")}>Execution history <span>{data.operations.length - active.length}</span></button></div>{rows.map((o) => <article className="operation-card" key={o.id}><div className="operation-card-head"><span className={`operation-mark ${o.status.toLowerCase()}`}/><div><h3>{o.name}</h3><p>{AgentName({ data, id: o.agentId })} · {o.started} · updated {o.updated}</p></div><span className="row-status">{o.status}</span></div><div className="progress-meta"><span>{o.stage}</span><b>{o.progress}%</b></div><div className="progress-track"><i style={{ width: `${o.progress}%` }}/></div>{o.error && <p className="error-note">{o.error}</p>}{["Running", "Queued", "Blocked", "Failed"].includes(o.status) && <div className="operation-controls">{["Failed", "Blocked"].includes(o.status) && <button className="secondary-action" onClick={() => onOperation(o.id, "Queued")}>Retry</button>}{["Running", "Queued"].includes(o.status) && <button className="danger-action" onClick={() => onOperation(o.id, "Cancelled")}>Cancel</button>}</div>}</article>)}{rows.length === 0 && <Empty text="No execution records in this view."/>}</Card></div> }

function RevenueWorkspace(props: Props & { query: string; setQuery: (s: string) => void; selected: string | null; setSelected: (s: string | null) => void }) { const { data, workspace, query, setQuery, selected, setSelected } = props; const leads = data.leads.filter((lead) => `${lead.company} ${lead.contact} ${lead.source} ${lead.stage}`.toLowerCase().includes(query.toLowerCase())); const focus = workspace; const selectedLead = data.leads.find((lead) => lead.id === selected) ?? data.leads[0]; const proposal = data.deals.find((deal) => deal.leadId === "lead-northstar")!; const invoicesTotal = data.invoices.reduce((total, invoice) => total + invoice.amount, 0); const leadRows = (rows = leads) => rows.map((lead) => <button className="linked-row" key={lead.id} onClick={() => { setSelected(lead.id); props.onNavigate("Revenue", "Lead details") }}><span className="round-icon cyan">{lead.company[0]}</span><span><b>{lead.company} · {lead.contact}</b><small>{lead.source} · {lead.stage} · {money(lead.value)} · {data.campaigns.find((campaign) => campaign.id === lead.campaignId)?.name}</small></span><span className="row-status">{lead.stage}</span><ArrowRight size={14}/></button>); const search = <label className="search-box"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search leads" placeholder="Search leads, contacts, stages"/></label>;
  if (workspace === "Lead details") return <div className="purpose-page"><Heading eyebrow="REVENUE / LEAD RECORD" title={selectedLead.company} detail={`${selectedLead.contact} · ${selectedLead.source} · ${selectedLead.stage} · ${money(selectedLead.value)} potential value`}/><div className="content-columns"><Card><span className="eyebrow">OPPORTUNITY</span><h3>{data.deals.find((deal) => deal.id === selectedLead.dealId)?.name ?? "Unqualified lead"}</h3><p>{selectedLead.dealId ? `Owned by ${AgentName({ data, id: data.deals.find((deal) => deal.id === selectedLead.dealId)!.ownerId })}` : "No opportunity created yet."}</p><button className="secondary-action" onClick={() => { props.onSelectRecord(selectedLead.clientId ?? null); props.onNavigate("Digital World", "Client details") }}>Open linked client</button></Card><Card><span className="eyebrow">OUTREACH CONTEXT</span><h3>{data.campaigns.find((campaign) => campaign.id === selectedLead.campaignId)?.name}</h3><p>Campaign relationship · {data.campaigns.find((campaign) => campaign.id === selectedLead.campaignId)?.status}</p><button className="secondary-action" onClick={() => props.onNavigate("Revenue", "Outreach studio")}>Open campaign</button></Card></div><Card><span className="eyebrow">RECORD ACTIVITY</span>{data.activities.filter((activity) => activity.recordId === selectedLead.id || data.approvals.some((approval) => approval.id === activity.recordId && approval.title.includes(selectedLead.company))).map((activity) => <div className="linked-row static-row" key={activity.id}><span><b>{AgentName({ data, id: activity.agentId })} {activity.action}</b><small>{activity.detail} · {activity.timestamp}</small></span></div>)}</Card></div>;
  if (workspace === "Overview") return <div className="purpose-page"><Heading eyebrow="REVENUE / DAILY PULSE" title="Opportunity, in motion." detail="A connected view of discovery, pipeline value, outreach, and client revenue."/><div className="metric-row"><Card><span>Open pipeline</span><strong>{money(data.deals.reduce((n, deal) => n + deal.amount, 0))}</strong><small>{data.deals.length} linked deals</small></Card><Card><span>New prospects</span><strong>{data.leads.filter((lead) => lead.stage === "New" || lead.stage === "Discovery").length}</strong><small>Discovery and qualification</small></Card><Card><span>Campaigns</span><strong>{data.campaigns.length}</strong><small>Drafts and review queue</small></Card><Card><span>Invoiced value</span><strong>{money(invoicesTotal)}</strong><small>{data.invoices.length} client-linked invoices</small></Card></div><div className="content-columns"><Card><div className="card-title"><h3>Latest opportunities</h3><button className="text-action" onClick={() => props.onNavigate("Revenue", "Sales pipeline")}>Open pipeline <ArrowRight size={14}/></button></div>{leadRows(data.leads.slice(0, 3))}</Card><Card><div className="card-title"><h3>Campaign health</h3><button className="text-action" onClick={() => props.onNavigate("Revenue", "Outreach studio")}>Open studio <ArrowRight size={14}/></button></div>{data.campaigns.map((campaign) => <div className="linked-row static-row" key={campaign.id}><span><b>{campaign.name}</b><small>{campaign.leadIds.length} linked leads · {AgentName({ data, id: campaign.agentId })}</small></span><span className="row-status">{campaign.status}</span></div>)}</Card></div></div>;
  if (workspace === "Lead discovery") return <div className="purpose-page"><Heading eyebrow="REVENUE / PROSPECTING" title="Lead discovery" detail="A source-aware qualification queue. Prioritize newly discovered and actively researched prospects before they enter the CRM."/><Card><div className="toolbar-row">{search}<select aria-label="Discovery source filter" value={query.includes("source:") ? query.slice(7) : "All sources"} onChange={(e) => setQuery(e.target.value === "All sources" ? "" : `source:${e.target.value}`)}><option>All sources</option><option>Referral</option><option>Website</option><option>Outbound</option><option>Partner</option></select></div>{leadRows(leads.filter((lead) => ["New", "Discovery", "Contacted"].includes(lead.stage)))}</Card></div>;
  if (workspace === "Lead CRM") return <div className="purpose-page"><Heading eyebrow="REVENUE / CRM" title="Lead CRM" detail="Shared lead records with company, contact, value, stage, campaign, and next action."/><Card><div className="toolbar-row">{search}<select aria-label="Lead stage filter" value={selected?.startsWith("stage:") ? selected.slice(6) : "All stages"} onChange={(e) => setSelected(e.target.value === "All stages" ? null : `stage:${e.target.value}`)}><option>All stages</option>{["New", "Discovery", "Contacted", "Qualified", "Proposal"].map((stage) => <option key={stage}>{stage}</option>)}</select></div>{leadRows(leads.filter((lead) => !selected?.startsWith("stage:") || lead.stage === selected.slice(6)))}</Card></div>;
  if (workspace === "Outreach studio") return <div className="purpose-page"><Heading eyebrow="REVENUE / CAMPAIGNS" title="Outreach studio" detail="Build and review campaign drafts tied to actual prospects. Sending is intentionally disabled in this local demo."/><Card>{data.campaigns.map((campaign) => <article className="approval-record" key={campaign.id}><span className="eyebrow">{campaign.channel} · {campaign.status}</span><h3>{campaign.name}</h3><p>Owner: {AgentName({ data, id: campaign.agentId })} · {campaign.leadIds.length} connected prospects</p>{campaign.leadIds.map((id) => data.leads.find((lead) => lead.id === id)).filter(Boolean).map((lead) => leadRows([lead!]))}<button className="secondary-action" onClick={() => setSelected(selected === campaign.id ? null : campaign.id)}>{selected === campaign.id ? "Draft changes saved locally" : "Edit campaign draft"}</button></article>)}</Card></div>;
  if (workspace === "Communication centre") return <div className="purpose-page"><Heading eyebrow="REVENUE / COMMUNICATIONS" title="Communication centre" detail="A record-linked activity timeline. Every touchpoint points back to its lead, proposal, or operation."/><Card>{data.activities.map((activity) => { const lead = data.leads.find((item) => item.id === activity.recordId); const operation = data.operations.find((item) => item.id === activity.recordId); const approval = data.approvals.find((item) => item.id === activity.recordId); return <div className="linked-row static-row" key={activity.id}><span className="round-icon cyan">{AgentName({ data, id: activity.agentId })[0]}</span><span><b>{AgentName({ data, id: activity.agentId })} {activity.action}</b><small>{activity.detail} · {activity.timestamp} · {lead?.company ?? operation?.name ?? approval?.title ?? activity.recordId}</small></span><span className="row-status">Demo timeline</span></div> })}</Card></div>;
  if (workspace === "Sales pipeline") return <div className="purpose-page"><Heading eyebrow="REVENUE / OPPORTUNITIES" title="Sales pipeline" detail="Move from discovery through proposal with the lead, deal amount, and owning agent attached."/><div className="task-board">{["New", "Discovery", "Qualified", "Proposal", "Proposal sent", "Closed"].map((stage) => <div className="board-column" key={stage}><h3>{stage}<span>{data.deals.filter((deal) => deal.stage === stage).length}</span></h3>{data.deals.filter((deal) => deal.stage === stage).map((deal) => { const lead = data.leads.find((item) => item.id === deal.leadId)!; return <button className="board-task" key={deal.id} onClick={() => { setSelected(lead.id); props.onNavigate("Revenue", "Lead details") }}><b>{lead.company}</b><small>{deal.name} · {money(deal.amount)}</small><span>{AgentName({ data, id: deal.ownerId })}</span></button> })}</div>)}</div></div>;
  if (workspace === "Proposals & invoices") return <div className="purpose-page"><Heading eyebrow="REVENUE / DOCUMENTS" title="Proposals & invoices" detail="Commercial documents connect to the underlying client, project, and opportunity."/><div className="content-columns"><Card><span className="eyebrow">PROPOSAL REVIEW</span><h3>{proposal.name} · {money(proposal.amount)}</h3><p>Northstar Studio · Closer · Scope and estimate approved before any external send.</p><button className="secondary-action" onClick={() => props.onNavigate("My Day", "Approvals")}>Open approval centre</button></Card><Card><span className="eyebrow">CLIENT INVOICES</span>{data.invoices.map((invoice) => <div className="linked-row static-row" key={invoice.id}><span><b>{invoice.number} · {clientNameFor(data, invoice.clientId)}</b><small>{data.projects.find((project) => project.id === invoice.projectId)?.name} · due {invoice.due}</small></span><span className="row-status">{money(invoice.amount)} · {invoice.status}</span></div>)}</Card></div></div>;
  if (workspace === "Finance") return <div className="purpose-page"><Heading eyebrow="REVENUE / FINANCE" title="Cashflow snapshot" detail="Illustrative receivables and invoicing by client. Values are demo data, not financial records."/><div className="metric-row"><Card><span>Draft & open</span><strong>{money(invoicesTotal)}</strong><small>Linked to {data.clients.length} clients</small></Card><Card><span>Awaiting review</span><strong>{data.invoices.filter((invoice) => invoice.status === "Awaiting review").length}</strong><small>Needs internal attention</small></Card><Card><span>Average deal</span><strong>{money(Math.round(data.deals.reduce((n, deal) => n + deal.amount, 0) / data.deals.length))}</strong><small>Across demo opportunities</small></Card><Card><span>Pipeline total</span><strong>{money(data.deals.reduce((n, deal) => n + deal.amount, 0))}</strong><small>Open opportunity value</small></Card></div><Card>{data.invoices.map((invoice) => <div className="linked-row static-row" key={invoice.id}><span><b>{clientNameFor(data, invoice.clientId)} · {invoice.number}</b><small>{data.projects.find((project) => project.id === invoice.projectId)?.name} · due {invoice.due}</small></span><span className="row-status">{money(invoice.amount)} · {invoice.status}</span></div>)}</Card></div>;
  if (workspace === "Revenue intelligence") return <div className="purpose-page"><Heading eyebrow="REVENUE / INTELLIGENCE" title="Where momentum is building" detail="A small, transparent readout derived from shared lead and deal records—not a live forecast."/><div className="metric-row"><Card><span>Lead-to-deal coverage</span><strong>{data.deals.length}/{data.leads.length}</strong><small>Qualified opportunities</small></Card><Card><span>Weighted opportunity set</span><strong>{money(data.deals.reduce((n, deal) => n + deal.amount, 0))}</strong><small>Unweighted demo total</small></Card><Card><span>Top source</span><strong>{data.leads.filter((lead) => lead.source === "Referral").length} referral</strong><small>Based on this sample set</small></Card><Card><span>Agent coverage</span><strong>{new Set(data.deals.map((deal) => deal.ownerId)).size}</strong><small>Distinct deal owners</small></Card></div><Card><span className="eyebrow">STAGE DISTRIBUTION</span>{["New", "Discovery", "Qualified", "Proposal", "Proposal sent"].map((stage) => <div className="progress-meta" key={stage}><span>{stage} · {data.deals.filter((deal) => deal.stage === stage).length} deals</span><b>{money(data.deals.filter((deal) => deal.stage === stage).reduce((n, deal) => n + deal.amount, 0))}</b></div>)}</Card></div>;
  return <div className="purpose-page"><Heading eyebrow="REVENUE / LEADS" title="Lead discovery" detail="Search and review shared lead records."/><Card>{search}{leadRows()}</Card></div>;
}

function RevenuePage(props: Props & { query: string; setQuery: (s: string) => void; selected: string | null; setSelected: (s: string | null) => void }) { const { data, workspace, query, setQuery, selected, setSelected } = props; const leads = data.leads.filter((l) => `${l.company} ${l.contact} ${l.stage}`.toLowerCase().includes(query.toLowerCase())); const currentLead = data.leads.find((l) => l.id === (selected ?? "lead-northstar"))!; const focus = workspace === "Lead discovery" ? "Lead discovery" : workspace === "Lead CRM" ? "Lead CRM" : workspace === "Lead details" ? "Lead details" : workspace === "Outreach studio" ? "Outreach studio" : workspace === "Communication centre" ? "Communications" : workspace === "Sales pipeline" ? "Sales pipeline" : workspace === "Proposals & invoices" ? "Proposals & invoices" : workspace === "Finance" ? "Finance" : workspace === "Revenue intelligence" ? "Revenue intelligence" : "Revenue overview"; const descriptions: Record<string, string> = { "Lead discovery": "Prioritize the shared prospect pool by source, fit, and next action.", "Lead CRM": "The connected lead book with contact, stage, value, and campaign relationships.", "Lead details": "A linked prospect profile, opportunity, and outreach context.", "Outreach studio": "Campaign drafts and their associated prospects; sending is not enabled.", Communications: "Conversation timeline associated with the actual lead and deal records.", "Sales pipeline": "Opportunities grouped by stage, with shared owners and values.", "Proposals & invoices": "Proposal review and invoice records linked to clients and projects.", Finance: "Illustrative revenue, receivables, and invoice relationships.", "Revenue intelligence": "A readout of pipeline mix, conversion focus, and agent coverage.", "Revenue overview": "A connected view of prospects, deals, and campaign activity." }; return <div className="purpose-page"><Heading eyebrow={`REVENUE / ${workspace.toUpperCase()}`} title={focus} detail={descriptions[focus]}/>{["Lead details"].includes(workspace) ? <Card><div className="detail-box"><span className="eyebrow">LEAD PROFILE · {currentLead.id}</span><h3>{currentLead.company}</h3><p>{currentLead.contact} · {currentLead.source} · {currentLead.stage}</p><div className="metric-row compact"><div><span>Potential value</span><strong>{money(currentLead.value)}</strong></div><div><span>Linked deal</span><strong>{data.deals.find((d) => d.id === currentLead.dealId)?.name ?? "Not qualified"}</strong></div><div><span>Campaign</span><strong>{currentLead.campaignId.replace("campaign-", "")}</strong></div></div><button className="secondary-action" onClick={() => { props.onSelectRecord(currentLead.clientId ?? null); props.onNavigate("Digital World", "Client details") }}>Open linked client <ArrowRight size={14}/></button></div></Card> : <Card><div className="toolbar-row"><label className="search-box"><Search size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search leads" placeholder="Search leads and contacts"/></label><span className="row-status">{leads.length} linked records</span></div>{workspace === "Sales pipeline" ? <div className="task-board">{["New", "Discovery", "Qualified", "Proposal", "Closed"].map((stage) => <div className="board-column" key={stage}><h3>{stage}<span>{data.deals.filter((d) => d.stage === stage).length}</span></h3>{data.deals.filter((d) => d.stage === stage).map((d) => { const lead = data.leads.find((l) => l.id === d.leadId)!; return <button className="board-task" key={d.id} onClick={() => { setSelected(lead.id); props.onNavigate("Revenue", "Lead details") }}><b>{lead.company}</b><small>{d.name} · {money(d.amount)}</small><span>{AgentName({ data, id: d.ownerId })}</span></button> })}</div>)}</div> : <div className="record-list">{workspace === "Outreach studio" ? data.campaigns.map((campaign) => <div className="campaign-summary" key={campaign.id}><Sparkles size={17}/><span><b>{campaign.name} · {campaign.status}</b><small>{campaign.leadIds.map((id) => data.leads.find((lead) => lead.id === id)?.company).filter(Boolean).join(", ")} · {AgentName({ data, id: campaign.agentId })} · {campaign.channel}</small></span><button className="secondary-action" onClick={() => setSelected(selected === campaign.id ? null : campaign.id)}>{selected === campaign.id ? "Draft opened" : "Open draft"}</button></div>) : null}{workspace === "Communication centre" ? data.activities.map((activity) => { const lead = data.leads.find((item) => item.id === activity.recordId); const operation = data.operations.find((item) => item.id === activity.recordId); const approval = data.approvals.find((item) => item.id === activity.recordId); return <div className="linked-row static-row" key={activity.id}><span className="round-icon cyan">{AgentName({ data, id: activity.agentId })[0]}</span><span><b>{AgentName({ data, id: activity.agentId })} {activity.action}</b><small>{activity.detail} · {activity.timestamp} · {lead?.company ?? operation?.name ?? approval?.title ?? activity.recordId}</small></span><span className="row-status">Timeline</span></div> }) : leads.map((lead) => <button className="linked-row" key={lead.id} onClick={() => { setSelected(lead.id); props.onNavigate("Revenue", "Lead details") }}><span className="round-icon cyan">{lead.company[0]}</span><span><b>{lead.company} · {lead.contact}</b><small>{lead.source} · {lead.stage} · {money(lead.value)} · {lead.campaignId.replace("campaign-", "")}</small></span><span className="row-status">{lead.stage}</span><ArrowRight size={15}/></button>)}</div>}{workspace === "Proposals & invoices" || workspace === "Finance" ? data.invoices.map((invoice) => <div className="linked-row static-row" key={invoice.id}><span className="round-icon amber">$</span><span><b>{invoice.number} · {clientNameFor(data, invoice.clientId)}</b><small>{data.projects.find((p) => p.id === invoice.projectId)?.name ?? "Client-level invoice"} · Due {invoice.due}</small></span><span className="row-status">{money(invoice.amount)} · {invoice.status}</span></div>) : null}</Card>}</div> }

function DigitalPage(props: Props & { selected: string | null; setSelected: (s: string | null) => void }) { const { data, workspace, selected, setSelected } = props; const focus = workspace === "Client details" ? "Client 360 profile" : workspace === "Clients" ? "Client portfolio" : workspace === "Projects" || workspace === "Project details" ? "Project delivery" : workspace === "Services" ? "Services & deliverables" : workspace === "Assets" ? "Digital asset library" : workspace === "Support" ? "Client support desk" : "Delivery overview"; const client = data.clients.find((c) => c.id === (selected ?? "client-northstar"))!; const project = data.projects.find((p) => p.id === (selected ?? "project-northstar"))!; if (workspace === "Overview") return <div className="purpose-page"><Heading eyebrow="DIGITAL WORLD / DELIVERY PULSE" title="Clients, projects, and delivery." detail="A portfolio view of connected client relationships, project health, milestones, and shared work."/><div className="metric-row"><Card><span>Active clients</span><strong>{data.clients.length}</strong><small>With shared relationship records</small></Card><Card><span>Open projects</span><strong>{data.projects.filter((p) => p.status !== "Complete").length}</strong><small>Across {data.clients.length} clients</small></Card><Card><span>At-risk projects</span><strong>{data.projects.filter((p) => p.status === "At risk").length}</strong><small>Milestone follow-up needed</small></Card><Card><span>Open delivery tasks</span><strong>{data.tasks.filter((t) => t.status !== "Done").length}</strong><small>Shared with My priorities</small></Card></div><div className="content-columns"><Card><div className="card-title"><h3>Client health</h3><button className="text-action" onClick={() => props.onNavigate("Digital World", "Clients")}>All clients <ArrowRight size={14}/></button></div>{data.clients.map((c) => <button className="linked-row" key={c.id} onClick={() => { setSelected(c.id); props.onNavigate("Digital World", "Client details") }}><span><b>{c.name}</b><small>{c.industry} · {data.projects.filter((p) => p.clientId === c.id).length} project(s)</small></span><span className="row-status">{c.health}</span></button>)}</Card><Card><div className="card-title"><h3>Upcoming milestones</h3><button className="text-action" onClick={() => props.onNavigate("Digital World", "Projects")}>Project board <ArrowRight size={14}/></button></div>{data.projects.map((p) => <button className="linked-row" key={p.id} onClick={() => { setSelected(p.id); props.onNavigate("Digital World", "Project details") }}><span><b>{p.milestone}</b><small>{clientNameFor(data, p.clientId)} · {p.name}</small></span><span className="row-status">{p.status}</span></button>)}</Card></div></div>; return <div className="purpose-page"><Heading eyebrow={`DIGITAL WORLD / ${workspace.toUpperCase()}`} title={focus} detail={workspace === "Tasks" ? "Project tasks share their source records with My priorities and operations." : "Client delivery records stay connected to their leads, projects, milestones, and assigned work."}/>{workspace === "Client details" ? <Card><div className="detail-box"><span className="eyebrow">CLIENT RECORD · {client.id}</span><h3>{client.name}</h3><p>{client.industry} · {client.health}</p><h4>Projects</h4>{data.projects.filter((p) => p.clientId === client.id).map((p) => <button className="linked-row" key={p.id} onClick={() => { setSelected(p.id); props.onNavigate("Digital World", "Project details") }}><span><b>{p.name}</b><small>{p.milestone} · due {p.due}</small></span><span>{p.status}</span><ArrowRight size={14}/></button>)}<button className="secondary-action" onClick={() => { props.onSelectRecord(client.leadId); props.onNavigate("Revenue", "Lead details") }}>View linked originating lead</button></div></Card> : workspace === "Project details" ? <Card><div className="detail-box"><span className="eyebrow">PROJECT RECORD · {project.id}</span><h3>{project.name}</h3><p>{clientNameFor(data, project.clientId)} · {project.status} · due {project.due}</p><div className="milestone-row"><span className="milestone-done">Discovery</span><span className="milestone-current">{project.milestone}</span><span>Delivery handoff</span></div><h4>Project tasks</h4>{data.tasks.filter((t) => t.projectId === project.id).map((t) => <div className="linked-row static-row" key={t.id}><span><b>{t.title}</b><small>{t.status} · {t.assignee} · {AgentName({ data, id: t.agentId })}</small></span></div>)}</div></Card> : <Card>{workspace === "Services" ? ["Brand strategy", "Digital experience", "Revenue operations", "Content systems"].map((item, i) => <div className="service-card" key={item}><span className="eyebrow">SERVICE 0{i + 1}</span><h3>{item}</h3><p>Defined scope, review milestones, and client-ready delivery templates.</p><button className="secondary-action" onClick={() => setSelected(selected === item ? null : item)}>{selected === item ? "Added to draft" : "View deliverables"}</button></div>) : workspace === "Assets" ? data.documents.map((d) => <button className="linked-row" key={d.id} onClick={() => { setSelected(d.id); props.onNavigate("Knowledge", "Documents") }}><span className="round-icon violet">▤</span><span><b>{d.title}</b><small>{d.source} · {d.collection}</small></span><ArrowRight size={14}/></button>) : workspace === "Support" ? ["Catalogue export access", "Identity review feedback", "Invoice clarification"].map((item, i) => <div className="linked-row static-row" key={item}><span className="round-icon amber">{i + 1}</span><span><b>{item}</b><small>{data.clients[i]?.name} · {i === 0 ? "Awaiting approval" : "Open · demo"}</small></span><button className="secondary-action" onClick={() => setSelected(selected === item ? null : item)}>{selected === item ? "Marked reviewed" : "Open ticket"}</button></div>) : workspace === "Clients" ? data.clients.map((c) => <button className="linked-row" key={c.id} onClick={() => { setSelected(c.id); props.onNavigate("Digital World", "Client details") }}><span className="round-icon cyan">{c.name[0]}</span><span><b>{c.name}</b><small>{c.industry} · {data.projects.filter((p) => p.clientId === c.id).length} projects</small></span><span className="row-status">{c.health}</span><ArrowRight size={15}/></button>) : data.projects.map((p) => <button className="linked-row" key={p.id} onClick={() => { setSelected(p.id); props.onNavigate("Digital World", "Project details") }}><span className="round-icon cyan">◈</span><span><b>{p.name}</b><small>{clientNameFor(data, p.clientId)} · {p.milestone} · due {p.due}</small></span><span className="row-status">{p.status}</span><ArrowRight size={14}/></button>)}</Card>}</div> }
function clientNameFor(data: DemoState, id: string) { return data.clients.find((c) => c.id === id)?.name ?? "Client" }

function AiModelsWorkspace({ onNavigate }: { onNavigate: (env: Environment, ws: string) => void }) {
  const [providerFilter, setProviderFilter] = useState<string>("All")
  const [activeModel, setActiveModel] = useState<string>("llama-3.3-70b-versatile")
  const [activeProvider, setActiveProvider] = useState<string>("groq")
  const [testPrompt, setTestPrompt] = useState<string>("Evaluate Q2 revenue momentum and identify conversion bottlenecks.")
  const [testResponse, setTestResponse] = useState<string>("")
  const [testLoading, setTestLoading] = useState<boolean>(false)
  const [testMeta, setTestMeta] = useState<string>("")
  const [statusNotice, setStatusNotice] = useState<string>("")

  const models = [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini", providerName: "Google Gemini", context: "1M tokens", speed: "Ultra Fast", recommended: true },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini", providerName: "Google Gemini", context: "2M tokens", speed: "Deep Reasoning", recommended: false },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", providerName: "Google Gemini", context: "1M tokens", speed: "Ultra Fast", recommended: false },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", provider: "gemini", providerName: "Google Gemini", context: "1M tokens", speed: "Fast", recommended: false },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "gemini", providerName: "Google Gemini", context: "2M tokens", speed: "Balanced", recommended: false },

    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile", provider: "groq", providerName: "Groq Cloud", context: "128K tokens", speed: "Fast", recommended: true },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant", provider: "groq", providerName: "Groq Cloud", context: "128K tokens", speed: "Ultra Fast", recommended: false },
    { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B", provider: "groq", providerName: "Groq Cloud", context: "128K tokens", speed: "Deep Reasoning", recommended: false },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B 32K", provider: "groq", providerName: "Groq Cloud", context: "32K tokens", speed: "Fast", recommended: false },
    { id: "gemma2-9b-it", name: "Gemma 2 9B IT", provider: "groq", providerName: "Groq Cloud", context: "8K tokens", speed: "Ultra Fast", recommended: false },

    { id: "gpt-4o", name: "GPT-4o (Omni)", provider: "openai", providerName: "OpenAI", context: "128K tokens", speed: "Deep Reasoning", recommended: false },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", providerName: "OpenAI", context: "128K tokens", speed: "Ultra Fast", recommended: true },
    { id: "o3-mini", name: "o3-mini (Reasoning)", provider: "openai", providerName: "OpenAI", context: "200K tokens", speed: "Deep Reasoning", recommended: false },

    { id: "@cf/meta/llama-3.1-8b-instruct", name: "Cloudflare Llama 3.1 8B", provider: "cloudflare", providerName: "Cloudflare Workers AI", context: "8K tokens", speed: "Balanced", recommended: false },
  ]

  useEffect(() => {
    fetch("/api/integrations/models")
      .then((r) => r.json())
      .then((res) => {
        if (res.activeModels) {
          if (res.activeModels.groq) setActiveModel(res.activeModels.groq)
        }
      })
      .catch(() => {})
  }, [])

  const filtered = models.filter((m) => providerFilter === "All" || m.provider === providerFilter)

  const activateModel = async (model: (typeof models)[0]) => {
    setActiveModel(model.id)
    setActiveProvider(model.provider)
    setStatusNotice(`Activating ${model.name}...`)
    try {
      const res = await fetch(`/api/integrations/${model.provider}/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryModel: model.id }),
      })
      if (res.ok) {
        setStatusNotice(`✓ ${model.name} activated as primary ${model.providerName} model!`)
      } else {
        setStatusNotice(`Model selection set to ${model.name} for this session.`)
      }
    } catch {
      setStatusNotice(`Model selected: ${model.name}`)
    }
  }

  const runTestPrompt = async () => {
    if (!testPrompt.trim()) return
    setTestLoading(true)
    setTestResponse("")
    setTestMeta("")
    const start = Date.now()
    try {
      const res = await fetch("/api/intelligence/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: testPrompt, model: activeModel, provider: activeProvider }),
      })
      const data = await res.json()
      const ms = Date.now() - start
      if (data.response) {
        setTestResponse(data.response)
        setTestMeta(`Latency: ${ms}ms · Model: ${data.model_used || activeModel} · Tokens: ${data.tokens_used || 0}`)
      } else if (data.error) {
        setTestResponse(`Error: ${data.error}`)
      }
    } catch (e: any) {
      setTestResponse(`Request failed: ${e.message}`)
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="AI TEAM / MODELS & ARCHITECTURE"
        title="Universal AI Model Routing"
        detail="Dynamic multi-model orchestration across Google Gemini, Groq, OpenAI, and Cloudflare. Select your primary intelligence layer or test reasoning in real-time."
        action={
          <button className="secondary-action" onClick={() => onNavigate("Execution & Settings", "Integrations")}>
            <Key size={14} /> Configure API Keys
          </button>
        }
      />

      <div className="metric-row">
        <Card>
          <span>Active Primary Model</span>
          <strong style={{ fontSize: "16px" }}>{activeModel}</strong>
          <small>Routing: {activeProvider.toUpperCase()}</small>
        </Card>
        <Card>
          <span>Available Models</span>
          <strong>{models.length}</strong>
          <small>4 Normalized Providers</small>
        </Card>
        <Card>
          <span>Fastest Inference</span>
          <strong style={{ color: "#54d9e8" }}>Groq & Gemini</strong>
          <small>Sub-300ms Time-to-First-Token</small>
        </Card>
        <Card>
          <span>Deep Reasoning</span>
          <strong style={{ color: "#c6a8ee" }}>DeepSeek & 2.5 Pro</strong>
          <small>Mathematical & Logic Evaluation</small>
        </Card>
      </div>

      <Card>
        <div className="card-title">
          <div>
            <span className="eyebrow">PROVIDER DIRECTORY</span>
            <h3>Select Specialist Model</h3>
          </div>
          <div className="segmented">
            {["All", "gemini", "groq", "openai", "cloudflare"].map((p) => (
              <button key={p} className={providerFilter === p ? "chosen" : ""} onClick={() => setProviderFilter(p)}>
                {p === "All" ? "All" : p === "gemini" ? "Gemini" : p === "groq" ? "Groq" : p === "openai" ? "OpenAI" : "Cloudflare"}
              </button>
            ))}
          </div>
        </div>

        {statusNotice && (
          <div style={{ margin: "10px 0", padding: "10px 14px", borderRadius: "8px", background: "#0c2b36", border: "1px solid #2e7a89", color: "#8be7f0", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>{statusNotice}</span>
            <button onClick={() => setStatusNotice("")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><X size={14} /></button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px", margin: "14px 0" }}>
          {filtered.map((m) => {
            const isSelected = activeModel === m.id
            return (
              <div
                key={m.id}
                style={{
                  padding: "14px",
                  borderRadius: "9px",
                  border: isSelected ? "1px solid #54d9e8" : "1px solid #1c3949",
                  background: isSelected ? "linear-gradient(135deg, #102e3c, #0a1b26)" : "#0b1b26",
                  boxShadow: isSelected ? "0 0 16px rgba(84, 217, 232, 0.15)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.1em", color: "#7495a3" }}>{m.providerName}</span>
                    {m.recommended && (
                      <span style={{ fontSize: "8px", padding: "2px 6px", borderRadius: "4px", background: "#1c4a4a", color: "#54d9c7", fontWeight: 600 }}>RECOMMENDED</span>
                    )}
                  </div>
                  <h4 style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 600, color: isSelected ? "#e6fbff" : "#d7e8ee" }}>{m.name}</h4>
                  <p style={{ margin: "0", fontSize: "9px", color: "#839aa7" }}>
                    Context: {m.context} · Speed: <span style={{ color: "#97c9d7" }}>{m.speed}</span>
                  </p>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", borderTop: "1px solid #162f3e" }}>
                  <code style={{ fontSize: "8px", color: "#6a8c9b" }}>{m.id}</code>
                  {isSelected ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "9px", color: "#54d9e8", fontWeight: 600 }}>
                      <CheckCircle2 size={13} /> Active
                    </span>
                  ) : (
                    <button className="secondary-action" onClick={() => activateModel(m)} style={{ padding: "4px 8px", fontSize: "9px" }}>
                      Activate Model
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <div className="card-title">
          <div>
            <span className="eyebrow">LIVE EVALUATION</span>
            <h3>Test Model Prompt Execution</h3>
          </div>
          <span style={{ fontSize: "9px", color: "#769aa8" }}>Target: <b>{activeModel}</b></span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "10px 0" }}>
          {[
            "Evaluate Q2 revenue momentum for Meridian Objects",
            "Draft follow-up email for Maya Chen at Northstar Studio",
            "Calculate financial break-even on $12,600 proposal",
          ].map((preset) => (
            <button
              key={preset}
              className="text-action"
              style={{ padding: "4px 8px", borderRadius: "5px", background: "#0c202d", border: "1px solid #1b3d4f", fontSize: "9px", color: "#a5cdd9" }}
              onClick={() => setTestPrompt(preset)}
            >
              &ldquo;{preset}&rdquo;
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <input
            style={{ flex: 1, padding: "10px 12px", borderRadius: "7px", background: "#081722", border: "1px solid #204153", color: "#e3f4f7", fontSize: "11px", outline: "none" }}
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Ask anything to test this model..."
            onKeyDown={(e) => { if (e.key === "Enter") runTestPrompt() }}
          />
          <button className="primary-action" onClick={runTestPrompt} disabled={testLoading}>
            {testLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {testLoading ? "Generating..." : "Run Test"}
          </button>
        </div>

        {testResponse && (
          <div style={{ marginTop: "14px", padding: "14px", borderRadius: "8px", background: "#0a1924", border: "1px solid #224d61" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{ fontSize: "9px", color: "#54d9e8", fontWeight: 600 }}>RESPONSE FROM {activeModel}</span>
              <span style={{ fontSize: "8px", color: "#77929f" }}>{testMeta}</span>
            </div>
            <p style={{ margin: 0, fontSize: "11px", lineHeight: "1.65", color: "#dbe8ee", whiteSpace: "pre-wrap" }}>{testResponse}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

function IntegrationsWorkspace({ onNavigate }: { onNavigate: (env: Environment, ws: string) => void }) {
  const [status, setStatus] = useState<any>(null)
  const [supabaseUrl, setSupabaseUrl] = useState("")
  const [supabaseServiceRoleKey, setSupabaseServiceRoleKey] = useState("")
  const [supabaseAnonKey, setSupabaseAnonKey] = useState("")
  const [groqKey, setGroqKey] = useState("")
  const [geminiKey, setGeminiKey] = useState("")
  const [openaiKey, setOpenaiKey] = useState("")
  const [tavilyKey, setTavilyKey] = useState("")
  const [resendKey, setResendKey] = useState("")
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile")
  const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash")
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini")

  const [loading, setLoading] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, string>>({})
  const [toast, setToast] = useState("")

  const [voiceConfig, setVoiceConfig] = useState<VoiceSettings>(() => getStoredVoiceSettings())
  const [testingVoice, setTestingVoice] = useState(false)
  const [voiceTestResult, setVoiceTestResult] = useState("")

  useEffect(() => {
    const handleVoiceChange = (e: any) => {
      if (e.detail) setVoiceConfig(e.detail)
    }
    window.addEventListener("thalos_voice_settings_changed", handleVoiceChange)
    return () => window.removeEventListener("thalos_voice_settings_changed", handleVoiceChange)
  }, [])

  const handleSaveVoice = () => {
    saveVoiceSettings(voiceConfig)
    setVoiceTestResult("✓ Voice settings saved to browser storage")
    setTimeout(() => setVoiceTestResult(""), 4000)
  }

  const handleTestVoice = async () => {
    setTestingVoice(true)
    setVoiceTestResult("Speaking test phrase...")
    try {
      const ok = await speakResponse("Greetings. THALOS voice engine is active and operational for Yugantar Growth.", voiceConfig)
      if (ok) {
        setVoiceTestResult("✓ Voice synthesis successful")
      } else {
        setVoiceTestResult("⚠️ Voice synthesis finished or not supported by browser")
      }
    } catch (err: any) {
      setVoiceTestResult(`Speech error: ${err.message}`)
    } finally {
      setTestingVoice(false)
      setTimeout(() => setVoiceTestResult(""), 4500)
    }
  }

  const handleVoicePackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const updated: VoiceSettings = {
        ...voiceConfig,
        provider: "custom_voice",
        customVoicePackName: file.name,
        customVoicePackData: reader.result as string,
      }
      setVoiceConfig(updated)
      saveVoiceSettings(updated)
      setVoiceTestResult(`✓ Loaded voice pack: ${file.name}`)
      setTimeout(() => setVoiceTestResult(""), 4000)
    }
    reader.readAsDataURL(file)
  }

  const loadStatus = () => {
    fetch("/api/integrations/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data)
        if (data.supabase?.url && !data.supabase.url.includes("placeholder")) {
          setSupabaseUrl(data.supabase.url)
        }
        if (data.providers?.groq?.primaryModel) setGroqModel(data.providers.groq.primaryModel)
        if (data.providers?.gemini?.primaryModel) setGeminiModel(data.providers.gemini.primaryModel)
        if (data.providers?.openai?.primaryModel) setOpenaiModel(data.providers.openai.primaryModel)
      })
      .catch(() => {})
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const saveSettings = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/integrations/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl: supabaseUrl || undefined,
          supabaseServiceRoleKey: supabaseServiceRoleKey || undefined,
          supabaseAnonKey: supabaseAnonKey || undefined,
          groqApiKey: groqKey || undefined,
          geminiApiKey: geminiKey || undefined,
          openaiApiKey: openaiKey || undefined,
          groqPrimaryModel: groqModel,
          geminiPrimaryModel: geminiModel,
          openaiPrimaryModel: openaiModel,
        }),
      })
      if (res.ok) {
        setToast("✓ Configuration and API keys saved successfully!")
        setSupabaseServiceRoleKey("")
        setSupabaseAnonKey("")
        setGroqKey("")
        setGeminiKey("")
        setOpenaiKey("")
        loadStatus()
      } else {
        setToast("Failed to save settings.")
      }
    } catch (e: any) {
      setToast(`Error saving settings: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const testConnection = async (integrationId: string) => {
    setTestResults((prev) => ({ ...prev, [integrationId]: "Testing..." }))
    try {
      const res = await fetch(`/api/integrations/${integrationId}/test`, { method: "POST" })
      const data = await res.json()
      if (data.result?.success) {
        setTestResults((prev) => ({
          ...prev,
          [integrationId]: `✓ Connected (${data.result.latencyMs}ms)${data.result.detail ? ` · ${data.result.detail}` : ""}`,
        }))
      } else {
        setTestResults((prev) => ({
          ...prev,
          [integrationId]: `✕ Failed: ${data.result?.error || data.error || "Connection error"}`,
        }))
      }
    } catch (e: any) {
      setTestResults((prev) => ({ ...prev, [integrationId]: `✕ Request failed: ${e.message}` }))
    }
  }

  const isSupabaseConnected = status?.supabase?.connected === true

  return (
    <div className="purpose-page">
      <Heading
        eyebrow="EXECUTION & SETTINGS / INTEGRATIONS"
        title="Infrastructure & API Keys"
        detail="Securely manage your Supabase database connection and AI provider API keys. Credentials are encrypted using AES-256-GCM and stored securely in the system vault."
        action={
          <button className="primary-action" onClick={saveSettings} disabled={loading}>
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Save All Changes
          </button>
        }
      />

      {toast && (
        <div style={{ margin: "10px 0", padding: "12px 14px", borderRadius: "8px", background: "#0c2b36", border: "1px solid #2e7a89", color: "#8be7f0", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{toast}</span>
          <button onClick={() => setToast("")} style={{ border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><X size={14} /></button>
        </div>
      )}

      {/* Supabase Card */}
      <Card>
        <div className="card-title">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="round-icon cyan"><Database size={15} /></span>
            <div>
              <span className="eyebrow">DATABASE BACKEND</span>
              <h3>Supabase Cloud PostgreSQL</h3>
            </div>
          </div>
          <span
            style={{
              padding: "5px 10px",
              borderRadius: "5px",
              fontSize: "10px",
              fontWeight: 600,
              background: isSupabaseConnected ? "#143b35" : "#3b2b1a",
              color: isSupabaseConnected ? "#55d9bb" : "#e6ba83",
              border: isSupabaseConnected ? "1px solid #256658" : "1px solid #664724",
            }}
          >
            {isSupabaseConnected ? "● CONNECTED" : "○ NOT CONNECTED"}
          </span>
        </div>

        <p style={{ fontSize: "10px", color: "#8ca2af", margin: "6px 0 14px" }}>
          {status?.supabase?.message || "Verify your Supabase project URL and service role key below."}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
          <label className="form-field" style={{ margin: 0 }}>
            <span style={{ fontSize: "9px", color: "#8ca1ad" }}>Supabase Project URL</span>
            <input
              placeholder="https://your-project.supabase.co"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
            />
          </label>
          <label className="form-field" style={{ margin: 0 }}>
            <span style={{ fontSize: "9px", color: "#8ca1ad" }}>Service Role Key (Secret)</span>
            <input
              type="password"
              placeholder={status?.supabase?.hasServiceRoleKey ? "•••••••• (Configured — leave blank to keep)" : "Paste service role key"}
              value={supabaseServiceRoleKey}
              onChange={(e) => setSupabaseServiceRoleKey(e.target.value)}
            />
          </label>
          <label className="form-field" style={{ margin: 0 }}>
            <span style={{ fontSize: "9px", color: "#8ca1ad" }}>Anon Public Key (Optional)</span>
            <input
              type="password"
              placeholder="Paste anon key"
              value={supabaseAnonKey}
              onChange={(e) => setSupabaseAnonKey(e.target.value)}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center" }}>
          <button className="secondary-action" onClick={() => testConnection("supabase")}>
            <RefreshCw size={13} /> Test Supabase Ping
          </button>
          {testResults.supabase && (
            <span style={{ fontSize: "10px", color: testResults.supabase.startsWith("✓") ? "#55d9bb" : "#e67f84" }}>
              {testResults.supabase}
            </span>
          )}
        </div>
      </Card>

      {/* AI Providers Section */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "11px", marginTop: "11px" }}>
        {/* Groq Card */}
        <Card>
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="round-icon violet"><Cpu size={15} /></span>
              <div>
                <span className="eyebrow">HIGH-SPEED INFERENCE</span>
                <h3>Groq Cloud (Llama & DeepSeek)</h3>
              </div>
            </div>
            <span style={{ fontSize: "9px", color: status?.providers?.groq?.configured ? "#54d9c7" : "#e0ba7e" }}>
              {status?.providers?.groq?.configured ? `Configured (${status.providers.groq.hint})` : "Awaiting Key"}
            </span>
          </div>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>Groq API Key (gsk_...)</span>
            <input
              type="password"
              placeholder={status?.providers?.groq?.hint ? `•••••••• (${status.providers.groq.hint})` : "Enter Groq API Key"}
              value={groqKey}
              onChange={(e) => setGroqKey(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>Default Groq Model</span>
            <select value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Recommended)</option>
              <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (Ultra Fast)</option>
              <option value="deepseek-r1-distill-llama-70b">DeepSeek R1 Distill 70B (Reasoning)</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B 32k</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
            <button className="secondary-action" onClick={() => testConnection("groq")}>
              <Zap size={13} /> Test Groq Connection
            </button>
            {testResults.groq && (
              <span style={{ fontSize: "9px", color: testResults.groq.startsWith("✓") ? "#55d9bb" : "#e67f84" }}>
                {testResults.groq}
              </span>
            )}
          </div>
        </Card>

        {/* Gemini Card */}
        <Card>
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="round-icon cyan"><Sparkles size={15} /></span>
              <div>
                <span className="eyebrow">QUALITY & REASONING</span>
                <h3>Google Gemini (2.5 & 1.5)</h3>
              </div>
            </div>
            <span style={{ fontSize: "9px", color: status?.providers?.gemini?.configured ? "#54d9c7" : "#e0ba7e" }}>
              {status?.providers?.gemini?.configured ? `Configured (${status.providers.gemini.hint})` : "Awaiting Key"}
            </span>
          </div>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>Gemini API Key (AIza...)</span>
            <input
              type="password"
              placeholder={status?.providers?.gemini?.hint ? `•••••••• (${status.providers.gemini.hint})` : "Enter Gemini API Key"}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>Default Gemini Model</span>
            <select value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Reasoning)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
            <button className="secondary-action" onClick={() => testConnection("gemini")}>
              <Zap size={13} /> Test Gemini Connection
            </button>
            {testResults.gemini && (
              <span style={{ fontSize: "9px", color: testResults.gemini.startsWith("✓") ? "#55d9bb" : "#e67f84" }}>
                {testResults.gemini}
              </span>
            )}
          </div>
        </Card>

        {/* OpenAI Card */}
        <Card>
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="round-icon amber"><Cpu size={15} /></span>
              <div>
                <span className="eyebrow">OMNI INTELLIGENCE</span>
                <h3>OpenAI (GPT-4o & o3-mini)</h3>
              </div>
            </div>
            <span style={{ fontSize: "9px", color: status?.providers?.openai?.configured ? "#54d9c7" : "#e0ba7e" }}>
              {status?.providers?.openai?.configured ? `Configured (${status.providers.openai.hint})` : "Awaiting Key"}
            </span>
          </div>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>OpenAI API Key (sk-...)</span>
            <input
              type="password"
              placeholder={status?.providers?.openai?.hint ? `•••••••• (${status.providers.openai.hint})` : "Enter OpenAI API Key"}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
            />
          </label>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>Default OpenAI Model</span>
            <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)}>
              <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cost Efficient)</option>
              <option value="gpt-4o">GPT-4o (Full Omni)</option>
              <option value="o3-mini">o3-mini (Advanced Reasoning)</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
            <button className="secondary-action" onClick={() => testConnection("openai")}>
              <Zap size={13} /> Test OpenAI Connection
            </button>
            {testResults.openai && (
              <span style={{ fontSize: "9px", color: testResults.openai.startsWith("✓") ? "#55d9bb" : "#e67f84" }}>
                {testResults.openai}
              </span>
            )}
          </div>
        </Card>

        {/* Tavily Search Card */}
        <Card>
          <div className="card-title">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="round-icon cyan"><Search size={15} /></span>
              <div>
                <span className="eyebrow">WEB RESEARCH</span>
                <h3>Tavily Real-Time Search</h3>
              </div>
            </div>
            <span style={{ fontSize: "9px", color: status?.providers?.tavily?.configured ? "#54d9c7" : "#e0ba7e" }}>
              {status?.providers?.tavily?.configured ? "Configured" : "Awaiting Key"}
            </span>
          </div>

          <label className="form-field">
            <span style={{ fontSize: "9px", color: "#839ba7" }}>Tavily API Key (tvly-...)</span>
            <input
              type="password"
              placeholder="Paste Tavily Key"
              value={tavilyKey}
              onChange={(e) => setTavilyKey(e.target.value)}
            />
          </label>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
            <button className="secondary-action" onClick={() => testConnection("tavily")}>
              <RefreshCw size={13} /> Test Search Connection
            </button>
            {testResults.tavily && (
              <span style={{ fontSize: "9px", color: testResults.tavily.startsWith("✓") ? "#55d9bb" : "#e67f84" }}>
                {testResults.tavily}
              </span>
            )}
          </div>
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
            <span style={{ fontSize: "9px", color: voiceConfig.enabled ? "#54d9c7" : "#e0ba7e" }}>
              {voiceConfig.enabled
                ? voiceConfig.provider === "elevenlabs"
                  ? "ElevenLabs Neural"
                  : voiceConfig.provider === "custom_voice"
                  ? "Custom Voice Pack"
                  : "Web Speech (Native/Android)"
                : "Voice Disabled"}
            </span>
          </div>

          <p style={{ fontSize: "10px", color: "#8299a5", margin: "6px 0 12px", lineHeight: "1.5" }}>
            Enable hands-free voice conversations with THALOS. Works out of the box with Android and desktop Web Speech API (zero setup, no API key needed), or integrate custom neural voices via ElevenLabs or custom audio packs.
          </p>

          <div style={{ display: "grid", gap: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "11px", color: "#d7e5ea" }}>
              <input
                type="checkbox"
                checked={voiceConfig.enabled}
                onChange={(e) => setVoiceConfig((prev) => ({ ...prev, enabled: e.target.checked }))}
                style={{ cursor: "pointer" }}
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
                    style={{ cursor: "pointer" }}
                  />
                  <span>Automatically speak THALOS responses aloud in Companion chat</span>
                </label>

                <label className="form-field">
                  <span style={{ fontSize: "9px", color: "#839ba7" }}>Voice Provider Engine</span>
                  <select
                    value={voiceConfig.provider}
                    onChange={(e) => setVoiceConfig((prev) => ({ ...prev, provider: e.target.value as any }))}
                    style={{
                      background: "#0a1822",
                      border: "1px solid #25414f",
                      color: "#d9e8ed",
                      borderRadius: "6px",
                      padding: "8px",
                      fontSize: "11px"
                    }}
                  >
                    <option value="web_speech">Web Speech API (Default · Native Android / Chrome / Safari · Free & No Setup)</option>
                    <option value="elevenlabs">ElevenLabs Neural Voice (Custom API Key & Voice ID)</option>
                    <option value="custom_voice">Custom Voice Pack (Upload Audio File / Profile)</option>
                  </select>
                </label>

                {voiceConfig.provider === "elevenlabs" && (
                  <div style={{ display: "grid", gap: "8px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid #1a303e" }}>
                    <label className="form-field">
                      <span style={{ fontSize: "9px", color: "#839ba7" }}>ElevenLabs API Key (xi-api-key)</span>
                      <input
                        type="password"
                        placeholder="Paste ElevenLabs API Key"
                        value={voiceConfig.elevenLabsApiKey || ""}
                        onChange={(e) => setVoiceConfig((prev) => ({ ...prev, elevenLabsApiKey: e.target.value }))}
                      />
                    </label>
                    <label className="form-field">
                      <span style={{ fontSize: "9px", color: "#839ba7" }}>Voice ID (Default: Rachel 21m00Tcm4TlvDq8ikWAM)</span>
                      <input
                        type="text"
                        placeholder="e.g. 21m00Tcm4TlvDq8ikWAM or custom cloned voice ID"
                        value={voiceConfig.elevenLabsVoiceId || ""}
                        onChange={(e) => setVoiceConfig((prev) => ({ ...prev, elevenLabsVoiceId: e.target.value }))}
                      />
                    </label>
                  </div>
                )}

                {voiceConfig.provider === "custom_voice" && (
                  <div style={{ display: "grid", gap: "8px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid #1a303e" }}>
                    <span style={{ fontSize: "9px", color: "#839ba7" }}>Upload Custom Voice Pack (.mp3, .wav, or .json voice profile)</span>
                    <input
                      type="file"
                      accept=".mp3,.wav,.ogg,.json"
                      onChange={handleVoicePackUpload}
                      style={{ fontSize: "10px", color: "#b9c9d0" }}
                    />
                    {voiceConfig.customVoicePackName && (
                      <span style={{ fontSize: "10px", color: "#54d9c7" }}>
                        ✓ Loaded pack: {voiceConfig.customVoicePackName}
                      </span>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={handleSaveVoice}
                    style={{ fontSize: "11px", padding: "6px 12px" }}
                  >
                    <Check size={13} /> Save Voice Settings
                  </button>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={handleTestVoice}
                    disabled={testingVoice}
                    style={{ fontSize: "11px", padding: "6px 12px" }}
                  >
                    <Volume2 size={13} className={testingVoice ? "animate-pulse" : ""} /> {testingVoice ? "Speaking..." : "Test Voice Output"}
                  </button>
                  {voiceTestResult && (
                    <span style={{ fontSize: "10px", color: voiceTestResult.startsWith("✓") ? "#55d9bb" : "#e0ba7e" }}>
                      {voiceTestResult}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
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
      .then((data) => setHealth(data))
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
        detail="Real-time multi-tier health monitoring for PostgreSQL database, AES-256-GCM vault, background worker lease, and memory utilization."
        action={
          <button className="secondary-action" onClick={checkHealth} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh Health
          </button>
        }
      />

      <div className="metric-row">
        <Card>
          <span>System Status</span>
          <strong style={{ color: health?.status === "ready" ? "#55d9bb" : "#e6ba83" }}>
            {health?.status === "ready" ? "READY" : "DIAGNOSTIC"}
          </strong>
          <small>{health?.status === "ready" ? "All services operational" : "Sub-system awaiting setup"}</small>
        </Card>
        <Card>
          <span>Vault Encryption</span>
          <strong style={{ color: "#54d9e8" }}>{health?.checks?.vault === "ok" ? "ACTIVE" : "PENDING"}</strong>
          <small>AES-256-GCM Envelope</small>
        </Card>
        <Card>
          <span>Database Ping</span>
          <strong style={{ fontSize: "15px" }}>{health?.checks?.database || "Testing..."}</strong>
          <small>Supabase Cloud PostgreSQL</small>
        </Card>
        <Card>
          <span>Background Workers</span>
          <strong style={{ color: "#c6a8ee" }}>3 Concurrency</strong>
          <small>5000ms Lease Interval</small>
        </Card>
      </div>

      <Card>
        <div className="card-title">
          <h3>Health Checks Summary</h3>
          <span style={{ fontSize: "9px", color: "#8199a6" }}>Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : "Just now"}</span>
        </div>

        <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
          {Object.entries(health?.checks || {}).map(([key, val]) => (
            <div key={key} className="linked-row static-row" style={{ padding: "10px 4px" }}>
              <span className="round-icon cyan"><Activity size={15} /></span>
              <div>
                <b style={{ textTransform: "capitalize" }}>{key} Subsystem</b>
                <small>{String(val)}</small>
              </div>
              <span className="row-status" style={{ color: String(val).includes("ok") ? "#55d9bb" : "#e6ba83" }}>
                {String(val).includes("ok") ? "Operational" : "Attention"}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function AgentsPage(props: Props & { selected: string | null; setSelected: (s: string | null) => void }) {
  const { data, workspace, selected, setSelected } = props
  const agent = data.agents.find((a) => a.id === selected) ?? data.agents[0]
  const [notice, setNotice] = useState("")

  if (workspace === "Models") {
    return <AiModelsWorkspace onNavigate={props.onNavigate} />
  }

  const description: Record<string, string> = {
    "Agent overview": "Nine specialists, one coordinated team. Profile and execution data is shared across the demo.",
    "Agent profiles": "Select a role to inspect its profile, assignment, and current status.",
    Instructions: "Versioned instruction drafts define role scope and review boundaries.",
    Personality: "Tune communication style and working preferences per specialist.",
    Tools: "Tool access is an explicit capability preview with permissions.",
    Knowledge: "Knowledge scopes link back to actual shared documents.",
    Permissions: "Permissions preview the human approval boundary for sensitive actions.",
    Workflows: "Agent workflows connect to the same operation and approval records.",
    Testing: "Run a safe scenario simulation with specialist agents.",
    "Custom agent creation": "Draft and configure a new specialist agent.",
  }

  if (workspace === "Agent overview") {
    return (
      <div className="purpose-page">
        <Heading eyebrow="AI TEAM / CAPACITY" title="Nine specialists. One team." detail="A roster and capacity briefing assembled from linked agent assignments and running operations." />
        <div className="metric-row">
          <Card><span>Ready</span><strong>{data.agents.filter((a) => a.status === "Ready").length}</strong><small>Available for assignment</small></Card>
          <Card><span>Working</span><strong>{data.agents.filter((a) => a.status === "Working").length}</strong><small>Currently executing</small></Card>
          <Card><span>Assigned tasks</span><strong>{data.tasks.filter((t) => t.status !== "Done").length}</strong><small>Shared delivery queue</small></Card>
          <Card><span>Pending approvals</span><strong>{data.approvals.filter((a) => a.status === "Pending").length}</strong><small>Awaiting human decision</small></Card>
        </div>
        <div className="content-columns">
          <Card>
            <div className="card-title">
              <h3>Specialist roster</h3>
              <button className="text-action" onClick={() => props.onNavigate("AI Team", "Agent profiles")}>Open profiles <ArrowRight size={14}/></button>
            </div>
            {data.agents.map((a) => (
              <button className="linked-row" key={a.id} onClick={() => { setSelected(a.id); props.onNavigate("AI Team", "Agent profiles") }}>
                <span className="round-icon violet">{a.initials}</span>
                <span><b>{a.name}</b><small>{a.role}</small></span>
                <span className="row-status">{a.status}</span>
              </button>
            ))}
          </Card>
          <Card>
            <div className="card-title">
              <h3>Current assignments</h3>
              <button className="text-action" onClick={() => props.onNavigate("Execution & Settings", "Operations")}>Execution monitor <ArrowRight size={14}/></button>
            </div>
            {data.operations.filter((o) => ["Running", "Queued", "Blocked", "Failed"].includes(o.status)).map((o) => <OperationRow key={o.id} operation={o} data={data}/>)}
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="purpose-page">
      <Heading eyebrow={`AI TEAM / ${workspace.toUpperCase()}`} title={workspace === "Agent overview" ? "Nine specialists. One team." : workspace} detail={description[workspace] || "Agent configuration."} />
      <div className="agent-directory">
        {data.agents.map((a) => (
          <button className={`agent-chip ${agent.id === a.id ? "chosen" : ""}`} key={a.id} onClick={() => setSelected(a.id)}>
            <span>{a.initials}</span><b>{a.name}</b><small>{a.status}</small>
          </button>
        ))}
      </div>
      <Card>
        <div className="detail-box">
          <span className="eyebrow">AGENT PROFILE · {agent.id}</span>
          <h3>{workspace === "Custom agent creation" ? "New specialist draft" : agent.name}</h3>
          <p>{agent.role} · {agent.status}</p>

          {workspace === "Instructions" ? (
            <label className="form-field">
              System instructions
              <textarea defaultValue={`You are ${agent.name}, a careful ${agent.role.toLowerCase()} specialist. Cite sources, explain uncertainty, and request review before consequential external actions.`} />
            </label>
          ) : workspace === "Personality" ? (
            <div className="setting-options">
              {["Concise", "Warm", "Analytical", "Proactive"].map((s) => (
                <button key={s} className={selected === s ? "selected-option" : ""} onClick={() => setSelected(s)}>{s}</button>
              ))}
            </div>
          ) : workspace === "Tools" ? (
            ["Read project records", "Draft client communications", "Request approval before sending"].map((s) => (
              <label className="check-setting" key={s}><input type="checkbox" defaultChecked />{s}</label>
            ))
          ) : workspace === "Knowledge" ? (
            data.documents.slice(0, 3).map((d) => (
              <div className="linked-row static-row" key={d.id}>
                <span><b>{d.title}</b><small>{d.collection} · {d.source}</small></span>
                <span>Granted</span>
              </div>
            ))
          ) : workspace === "Permissions" ? (
            <div className="permission-callout">
              <ShieldCheck size={17} />
              <span><b>Human review required</b><small>Client-facing actions stay pending until approved in Approval Centre.</small></span>
            </div>
          ) : workspace === "Workflows" ? (
            data.operations.filter((o) => o.agentId === agent.id).map((o) => <OperationRow key={o.id} operation={o} data={data} />)
          ) : workspace === "Testing" ? (
            <>
              <label className="form-field">
                Test prompt
                <textarea placeholder="Describe a safe scenario to simulate with this specialist..." />
              </label>
              <button className="primary-action" onClick={() => setNotice("Scenario simulation initiated.")}>Run scenario</button>
              {notice && <p className="inline-notice">{notice}</p>}
            </>
          ) : workspace === "Custom agent creation" ? (
            <>
              <label className="form-field">Agent name<input placeholder="e.g. Quality reviewer" /></label>
              <label className="form-field">Role description<textarea placeholder="What should this specialist own?" /></label>
              <button className="primary-action" onClick={() => setNotice("Agent draft saved successfully.")}>Save agent</button>
              {notice && <p className="inline-notice">{notice}</p>}
            </>
          ) : (
            <>
              <div className="metric-row compact">
                <div><span>Current assignments</span><strong>{data.tasks.filter((t) => t.agentId === agent.id).length}</strong></div>
                <div><span>Operations</span><strong>{data.operations.filter((o) => o.agentId === agent.id).length}</strong></div>
                <div><span>Approval requests</span><strong>{data.approvals.filter((a) => a.agentId === agent.id).length}</strong></div>
              </div>
              <p>Specialist configuration is active and coordinated with THALOS central orchestrator.</p>
            </>
          )}
        </div>
      </Card>
    </div>
  )
}

function KnowledgePage(props: Props & { query: string; setQuery: (s: string) => void; selected: string | null; setSelected: (s: string | null) => void }) {
  const { data, workspace, query, setQuery, selected, setSelected } = props
  const docs = data.documents.filter((d) => `${d.title} ${d.collection} ${d.summary}`.toLowerCase().includes(query.toLowerCase()))
  const doc = data.documents.find((d) => d.id === selected) ?? data.documents[0]

  return (
    <div className="purpose-page">
      <Heading eyebrow={`KNOWLEDGE / ${workspace.toUpperCase()}`} title={workspace} detail={workspace === "Search" ? "Search indexed demo sources and open a cited document record." : "A source-aware memory with documents connected to clients, projects, and agent knowledge scopes."} />
      <Card>
        {workspace === "Search" && (
          <label className="search-box knowledge-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search document title, collection, or content" aria-label="Search knowledge" />
          </label>
        )}
        {workspace === "Collections" ? (
          ["Company", "Client · Northstar Studio", "Operations", "Agent knowledge"].map((c) => (
            <button className="linked-row" key={c} onClick={() => { setQuery(c.split(" · ").pop() ?? c); setSelected(c) }}>
              <span className="round-icon cyan">▤</span>
              <span><b>{c}</b><small>{data.documents.filter((d) => d.collection.includes(c.split(" · ").pop() ?? c)).length || 1} linked documents · reviewed sources</small></span>
              <ArrowRight size={14} />
            </button>
          ))
        ) : workspace === "Sources" ? (
          data.documents.map((d) => (
            <div className="linked-row static-row" key={d.id}>
              <span><b>{d.source}</b><small>{d.title} · last checked {d.updated}</small></span>
              <span className="row-status">Available</span>
              <button className="secondary-action" onClick={() => setSelected(d.id)}>Inspect source</button>
            </div>
          ))
        ) : workspace === "Document details" && selected ? (
          <div className="detail-box">
            <span className="eyebrow">DOCUMENT · {doc.id}</span>
            <h3>{doc.title}</h3>
            <p>{doc.summary}</p>
            <div className="detail-meta">
              <span>Collection: {doc.collection}</span>
              <span>Source: {doc.source}</span>
              <span>Updated: {doc.updated}</span>
            </div>
            <button className="secondary-action" onClick={() => props.onNavigate("Digital World", "Projects")}>Open related projects</button>
          </div>
        ) : (
          docs.map((d) => (
            <button className="linked-row" key={d.id} onClick={() => { setSelected(d.id); if (workspace !== "Document details") props.onNavigate("Knowledge", "Document details") }}>
              <span className="round-icon violet">▤</span>
              <span><b>{d.title}</b><small>{d.collection} · {d.source} · updated {d.updated}</small></span>
              <ArrowRight size={14} />
            </button>
          ))
        )}
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

  const commonText: Record<string, string> = {
    "Workflow studio": "Compose a reviewable sequence from the connected demo operations.",
    History: "An immutable-style audit timeline of operation and approval decisions.",
    Security: "Review boundaries and data handling settings for this operating system.",
    Operations: "Live executions and queued work, connected to the Execution Monitor.",
  }

  const content: Record<string, string[]> = {
    "Workflow studio": ["Lead qualification → human review", "Proposal preparation → approval", "Knowledge digest → source validation"],
    History: [...data.approvalHistory.map((a) => `${a.title} · ${a.status}`), ...data.operations.filter((o) => ["Completed", "Failed", "Cancelled"].includes(o.status)).map((o) => `${o.name} · ${o.status}`)],
    Security: ["Approval required for external actions", "AES-256-GCM Envelope Encryption", "SSRF & Injection Protections Active", "Strict Audit Logging Enforced"],
    Operations: data.operations.map((o) => `${o.name} · ${o.status} · ${AgentName({ data, id: o.agentId })}`),
  }

  return (
    <div className="purpose-page">
      <Heading eyebrow={`EXECUTION & SETTINGS / ${workspace.toUpperCase()}`} title={workspace} detail={commonText[workspace] ?? "Control and configuration records."} />
      <Card>
        {(content[workspace] ?? []).map((row, i) => (
          <div className="linked-row static-row" key={`${row}-${i}`}>
            <span className="round-icon cyan">{workspace === "History" ? <Clock3 size={15} /> : <ShieldCheck size={15} />}</span>
            <span><b>{row.split(" · ")[0]}</b><small>{row.split(" · ").slice(1).join(" · ") || "Ready for review"}</small></span>
            {workspace === "Workflow studio" && (
              <button className="secondary-action" onClick={() => setSelected(selected === row ? null : row)}>
                {selected === row ? "Draft opened" : "Preview"}
              </button>
            )}
          </div>
        ))}
        {workspace === "Workflow studio" && (
          <button className="primary-action" onClick={() => setSelected("New workflow draft")} style={{ marginTop: "10px" }}>
            <Plus size={14} /> New workflow
          </button>
        )}
      </Card>
    </div>
  )
}
