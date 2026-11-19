export type Environment = "My Day" | "Revenue" | "Digital World" | "AI Team" | "Knowledge" | "Execution & Settings"
export type TaskStatus = "Open" | "In progress" | "Blocked" | "Done"
export type ApprovalStatus = "Pending" | "Approved" | "Rejected" | "Changes requested"
export type OperationStatus = "Running" | "Queued" | "Blocked" | "Failed" | "Completed" | "Cancelled"

export const environments: { name: Environment; description: string }[] = [
  { name: "My Day", description: "Your business, in focus." },
  { name: "Revenue", description: "Turn opportunity into momentum." },
  { name: "Digital World", description: "The work behind every outcome." },
  { name: "AI Team", description: "A specialist for every ambition." },
  { name: "Knowledge", description: "Every answer, with its source." },
  { name: "Execution & Settings", description: "Designed for intentional action." },
]

export const workspaces: Record<Environment, string[]> = {
  "My Day": ["Overview", "My priorities", "Approvals", "Active operations"],
  Revenue: ["Overview", "Lead discovery", "Lead CRM", "Lead details", "Outreach studio", "Communication centre", "Sales pipeline", "Proposals & invoices", "Finance", "Revenue intelligence"],
  "Digital World": ["Overview", "Clients", "Client details", "Projects", "Project details", "Tasks", "Services", "Assets", "Support"],
  "AI Team": ["Agent overview", "Agent profiles", "Instructions", "Personality", "Models", "Tools", "Knowledge", "Permissions", "Workflows", "Testing", "Custom agent creation"],
  Knowledge: ["Collections", "Documents", "Search", "Sources", "Document details"],
  "Execution & Settings": ["Operations", "Workflow studio", "Approvals", "History", "System health", "Integrations", "Security", "Configuration"],
}

export type Agent = { id: string; name: string; role: string; status: string; initials: string }
export type Client = { id: string; name: string; industry: string; health: string; leadId: string }
export type Lead = { id: string; company: string; contact: string; source: string; stage: string; value: number; clientId?: string; dealId?: string; campaignId: string }
export type Deal = { id: string; leadId: string; name: string; amount: number; stage: string; ownerId: string }
export type Task = { id: string; title: string; projectId: string; agentId: string; assignee: string; priority: "Urgent" | "High" | "Normal"; status: TaskStatus; due: string; description: string }
export type Approval = { id: string; title: string; agentId: string; action: string; reason: string; impact: string; risk: string; context: string; status: ApprovalStatus; created: string }
export type Operation = { id: string; name: string; agentId: string; status: OperationStatus; progress: number; stage: string; started: string; updated: string; error?: string }
export type Project = { id: string; clientId: string; name: string; status: string; due: string; milestone: string; taskIds: string[] }
export type Document = { id: string; title: string; collection: string; source: string; updated: string; summary: string }
export type Campaign = { id: string; name: string; agentId: string; status: string; leadIds: string[]; channel: string }
export type Invoice = { id: string; number: string; clientId: string; projectId?: string; amount: number; status: string; due: string }
export type ActivityRecord = { id: string; recordId: string; agentId: string; action: string; detail: string; timestamp: string }
export type DemoState = { agents: Agent[]; clients: Client[]; leads: Lead[]; deals: Deal[]; tasks: Task[]; approvals: Approval[]; operations: Operation[]; projects: Project[]; documents: Document[]; campaigns: Campaign[]; invoices: Invoice[]; activities: ActivityRecord[]; approvalHistory: Approval[] }

export const initialDemoState: DemoState = {
  agents: [
    { id: "agent-thalos", name: "THALOS", role: "Central intelligence", status: "Ready", initials: "T" },
    { id: "agent-scout", name: "Scout", role: "Lead discovery", status: "Ready", initials: "S" },
    { id: "agent-hunter", name: "Hunter", role: "Outreach & follow-ups", status: "Idle", initials: "H" },
    { id: "agent-researcher", name: "Researcher", role: "Research & verification", status: "Working", initials: "R" },
    { id: "agent-analyst", name: "Analyst", role: "Analytics & evaluation", status: "Ready", initials: "A" },
    { id: "agent-operator", name: "Operator", role: "Operations & coordination", status: "Idle", initials: "O" },
    { id: "agent-spark", name: "Spark", role: "Content creation", status: "Ready", initials: "S" },
    { id: "agent-publisher", name: "Publisher", role: "Publishing & distribution", status: "Disabled", initials: "P" },
    { id: "agent-closer", name: "Closer", role: "Sales & proposals", status: "Ready", initials: "C" },
  ],
  clients: [
    { id: "client-northstar", name: "Northstar Studio", industry: "Design & creative", health: "On track", leadId: "lead-northstar" },
    { id: "client-meridian", name: "Meridian Objects", industry: "Consumer goods", health: "Needs attention", leadId: "lead-meridian" },
    { id: "client-formfield", name: "Form & Field", industry: "Professional services", health: "On track", leadId: "lead-formfield" },
    { id: "client-atelier", name: "Atelier Moss", industry: "Interior design", health: "On track", leadId: "lead-atelier" },
  ],
  leads: [
    { id: "lead-northstar", company: "Northstar Studio", contact: "Maya Chen", source: "Referral", stage: "Proposal", value: 8400, clientId: "client-northstar", dealId: "deal-northstar", campaignId: "campaign-brand" },
    { id: "lead-meridian", company: "Meridian Objects", contact: "Alex Rivera", source: "Website", stage: "Qualified", value: 12600, clientId: "client-meridian", dealId: "deal-meridian", campaignId: "campaign-spring" },
    { id: "lead-formfield", company: "Form & Field", contact: "Jordan Lee", source: "Outbound", stage: "Discovery", value: 5200, clientId: "client-formfield", dealId: "deal-formfield", campaignId: "campaign-spring" },
    { id: "lead-atelier", company: "Atelier Moss", contact: "Sam Okafor", source: "Partner", stage: "New", value: 9800, clientId: "client-atelier", dealId: "deal-atelier", campaignId: "campaign-brand" },
    { id: "lead-lumen", company: "Lumen Office", contact: "Taylor Kim", source: "Discovery", stage: "Contacted", value: 6800, campaignId: "campaign-spring" },
  ],
  deals: [
    { id: "deal-northstar", leadId: "lead-northstar", name: "Brand refresh", amount: 8400, stage: "Proposal", ownerId: "agent-closer" },
    { id: "deal-meridian", leadId: "lead-meridian", name: "Commerce website", amount: 12600, stage: "Qualified", ownerId: "agent-hunter" },
    { id: "deal-formfield", leadId: "lead-formfield", name: "Search strategy", amount: 5200, stage: "Discovery", ownerId: "agent-scout" },
    { id: "deal-atelier", leadId: "lead-atelier", name: "CRM foundation", amount: 9800, stage: "New", ownerId: "agent-researcher" },
  ],
  campaigns: [
    { id: "campaign-brand", name: "Brand refresh introduction", agentId: "agent-hunter", status: "Draft", leadIds: ["lead-northstar", "lead-atelier"], channel: "Email preview" },
    { id: "campaign-spring", name: "Spring discovery", agentId: "agent-hunter", status: "Review", leadIds: ["lead-meridian", "lead-formfield", "lead-lumen"], channel: "Email preview" },
  ],
  invoices: [
    { id: "invoice-northstar", number: "INV-1042", clientId: "client-northstar", projectId: "project-northstar", amount: 8400, status: "Draft", due: "May 16" },
    { id: "invoice-meridian", number: "INV-1043", clientId: "client-meridian", projectId: "project-meridian", amount: 4200, status: "Awaiting review", due: "May 22" },
  ],
  projects: [
    { id: "project-northstar", clientId: "client-northstar", name: "Brand refresh", status: "In progress", due: "May 16", milestone: "Identity review · May 08", taskIds: ["task-copy", "task-identity"] },
    { id: "project-meridian", clientId: "client-meridian", name: "Commerce website", status: "At risk", due: "May 22", milestone: "Product import · May 02", taskIds: ["task-catalog"] },
    { id: "project-formfield", clientId: "client-formfield", name: "Search strategy", status: "Planning", due: "May 30", milestone: "Research sign-off · May 12", taskIds: ["task-keywords"] },
    { id: "project-atelier", clientId: "client-atelier", name: "CRM foundation", status: "On track", due: "Jun 04", milestone: "Data map · May 14", taskIds: [] },
  ],
  tasks: [
    { id: "task-copy", title: "Review Q2 growth plan", projectId: "project-northstar", agentId: "agent-analyst", assignee: "You", priority: "Urgent", status: "In progress", due: "Today", description: "Review the campaign assumptions and approve the next-step priorities." },
    { id: "task-identity", title: "Prepare identity review", projectId: "project-northstar", agentId: "agent-spark", assignee: "Maya Chen", priority: "High", status: "Open", due: "May 08", description: "Assemble identity directions and rationale for the Northstar review." },
    { id: "task-catalog", title: "Resolve product catalogue mapping", projectId: "project-meridian", agentId: "agent-operator", assignee: "Alex Rivera", priority: "Urgent", status: "Blocked", due: "May 02", description: "Confirm the sample catalogue field mapping before the import milestone." },
    { id: "task-keywords", title: "Approve search themes", projectId: "project-formfield", agentId: "agent-researcher", assignee: "You", priority: "Normal", status: "Open", due: "May 12", description: "Review the initial search themes and research sources." },
  ],
  approvals: [
    { id: "approval-northstar", title: "Northstar Studio · brand refresh", agentId: "agent-closer", action: "Send proposal for $8,400", reason: "Proposal draft is ready for client review.", impact: "$8,400 opportunity · client-facing email", risk: "Medium · external communication", context: "Scope includes identity strategy, visual system, and delivery milestones. Linked deal: Brand refresh.", status: "Pending", created: "Today · 9:12 AM" },
    { id: "approval-meridian", title: "Meridian Objects · catalogue access", agentId: "agent-operator", action: "Request sample catalogue export", reason: "Product data is needed to unblock the import milestone.", impact: "Project milestone may move by 2 days", risk: "Low · read-only request", context: "Linked project: Commerce website. No files are sent in this demo.", status: "Pending", created: "Today · 8:46 AM" },
  ],
  approvalHistory: [],
  operations: [
    { id: "operation-research", name: "Website research brief", agentId: "agent-researcher", status: "Running", progress: 68, stage: "Source review", started: "9:02 AM", updated: "2 min ago" },
    { id: "operation-qualify", name: "Lead qualification · Lumen Office", agentId: "agent-scout", status: "Queued", progress: 0, stage: "Waiting for capacity", started: "Queued", updated: "6 min ago" },
    { id: "operation-import", name: "Product catalogue mapping", agentId: "agent-operator", status: "Blocked", progress: 42, stage: "Awaiting client data", started: "8:18 AM", updated: "11 min ago", error: "Sample catalogue export has not been approved." },
    { id: "operation-digest", name: "Weekly knowledge digest", agentId: "agent-spark", status: "Failed", progress: 76, stage: "Formatting", started: "Yesterday", updated: "Yesterday", error: "A sample source document could not be parsed." },
    { id: "operation-campaign", name: "Spring discovery campaign", agentId: "agent-hunter", status: "Completed", progress: 100, stage: "Complete", started: "Yesterday", updated: "Yesterday" },
  ],
  activities: [
    { id: "activity-research", recordId: "operation-research", agentId: "agent-researcher", action: "prepared a source review", detail: "Website research brief · 12 sources", timestamp: "8 min ago" },
    { id: "activity-spark", recordId: "project-northstar", agentId: "agent-spark", action: "drafted campaign concepts", detail: "Northstar Studio · identity review", timestamp: "24 min ago" },
    { id: "activity-proposal", recordId: "approval-northstar", agentId: "agent-closer", action: "requested your approval", detail: "Northstar Studio · $8,400 proposal", timestamp: "1 hour ago" },
  ],
  documents: [
    { id: "doc-brand", title: "Brand voice & messaging", collection: "Company", source: "Brand handbook · 12 pages", updated: "Apr 24", summary: "Voice principles, messaging hierarchy, and approved language for company communications." },
    { id: "doc-northstar", title: "Northstar project brief", collection: "Client · Northstar Studio", source: "Project brief · PDF", updated: "Apr 22", summary: "Goals, audience, scope, and milestones for the Northstar brand refresh." },
    { id: "doc-discovery", title: "Discovery playbook", collection: "Operations", source: "Internal guide · 8 pages", updated: "Apr 19", summary: "A repeatable, source-aware process for evaluating new business opportunities." },
    { id: "doc-audit", title: "Website audit checklist", collection: "Agent knowledge", source: "Markdown · 4 pages", updated: "Apr 16", summary: "Technical, content, and accessibility checks used by the Researcher agent." },
  ],
}

export function slugify(value: string) { return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }
export function environmentFromSlug(slug?: string): Environment { return environments.find((item) => slugify(item.name) === slug)?.name ?? environments[0].name }
export function workspaceFromSlug(environment: Environment, slug?: string) { return workspaces[environment].find((item) => slugify(item) === slug) ?? workspaces[environment][0] }
