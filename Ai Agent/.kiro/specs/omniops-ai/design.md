# Technical Design Document
## OmniOps AI — Autonomous Multi-Agent Enterprise Operations System

---

## 1. System Overview

OmniOps AI is a hierarchical multi-agent system built on LangGraph, FastAPI, and cloud-native infrastructure. A Supervisor Agent orchestrates specialized domain agents (DevOps, Data Analyst, Research, Support, Security) via the Agent-as-a-Tool pattern. A Memory Agent provides shared context infrastructure. A Decision Engine synthesizes multi-agent outputs into grounded recommendations. Human-in-the-loop approval gates protect all production-impacting actions.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│   Next.js Dashboard  │  REST API Clients  │  Webhook Sources    │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────▼──────────────────────────────────┐
│                       API GATEWAY (FastAPI)                     │
│  OAuth2/JWT/SSO Auth │ Rate Limiting │ Prompt Injection Filter  │
│  TLS Termination     │ RBAC Enforcement │ Audit Log Writer       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ Internal gRPC / HTTP
┌──────────────────────────────▼──────────────────────────────────┐
│                    SUPERVISOR AGENT (LangGraph)                 │
│  Task Decomposition │ Agent Routing │ Workflow State Machine    │
│  Approval Checkpoint Manager │ Decision Engine Orchestrator     │
└────┬──────────┬──────────┬──────────┬──────────┬───────────────┘
     │          │          │          │          │
┌────▼──┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌───▼──────┐
│DevOps │  │ Data  │  │Research│  │Support│  │Security  │
│Agent  │  │Analyst│  │ Agent  │  │ Agent │  │ Agent    │
└───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘  └───┬──────┘
    │          │           │          │           │
┌───▼──────────▼───────────▼──────────▼───────────▼──────┐
│                    TOOL LAYER                           │
│  K8s API │ PostgreSQL │ MongoDB │ Slack │ Jira │ AWS    │
│  GitHub  │ Web Search │ KB API  │ Threat Feeds          │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│                  MEMORY AGENT                            │
│  Session Memory (Redis) │ Long-Term Memory (PostgreSQL)  │
│  Vector DB (Pinecone/Weaviate/ChromaDB) │ Embeddings     │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│               OBSERVABILITY LAYER                        │
│  OpenTelemetry │ Prometheus │ Grafana │ LangSmith │ ELK  │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Component Design

### 3.1 API Gateway

**Technology:** FastAPI + python-jose (JWT) + authlib (OAuth2/SSO)

**Responsibilities:**
- Authenticate all inbound requests (OAuth2, JWT, SSO)
- Enforce per-client rate limits via Redis token bucket
- Apply prompt injection filter before forwarding
- Write audit log entry for every request
- Route validated requests to Supervisor Agent via internal HTTP


**Request Flow:**
```
Client → TLS Termination → Auth Middleware → Rate Limit Check
       → Prompt Injection Filter → RBAC Pre-check → Route to Supervisor
```

**Key Interfaces:**
```python
POST /api/v1/execute          # Submit workflow request
GET  /api/v1/tasks/{id}       # Poll workflow status
GET  /api/v1/agents/status    # Agent health
POST /api/v1/memory/search    # Semantic memory search
POST /api/v1/approvals        # Submit approval decision
GET  /api/v1/workflows/{id}/stream  # SSE stream for live updates
```

---

### 3.2 Supervisor Agent

**Technology:** LangGraph StateGraph + Celery for async dispatch

**State Schema:**
```python
class WorkflowState(TypedDict):
    workflow_id: str
    user_id: str
    original_request: str
    subtasks: list[SubTask]
    agent_outputs: dict[str, AgentOutput]
    pending_approvals: list[ApprovalCheckpoint]
    status: Literal["pending","running","degraded","completed","failed","awaiting_approval"]
    created_at: datetime
    updated_at: datetime
    execution_snapshots: list[ExecutionSnapshot]
    final_output: Optional[SynthesizedOutput]
```

**LangGraph Node Map:**
```
[START]
  → decompose_task_node
  → route_to_agents_node (fan-out: concurrent subtasks)
  → [DevOps|DataAnalyst|Research|Support|Security]_node
  → collect_results_node (fan-in)
  → approval_gate_node  (conditional: if approval required)
  → decision_engine_node
  → notify_user_node
[END]
```

**Routing Logic:**
```python
DOMAIN_ROUTING = {
    "infrastructure": "devops_agent",
    "kubernetes":     "devops_agent",
    "cicd":           "devops_agent",
    "data":           "analyst_agent",
    "sql":            "analyst_agent",
    "kpi":            "analyst_agent",
    "research":       "research_agent",
    "knowledge":      "research_agent",
    "ticket":         "support_agent",
    "customer":       "support_agent",
    "security":       "security_agent",
    "threat":         "security_agent",
    "compliance":     "security_agent",
}
```

---

### 3.3 Specialized Agents

Each agent is implemented as a LangGraph subgraph exposed as a callable tool to the Supervisor.

**Base Agent Contract:**
```python
class BaseAgent(ABC):
    name: str
    domain: str
    allowed_tools: list[str]
    llm_provider: LLMProvider

    async def execute(self, subtask: SubTask, context: SessionContext) -> AgentOutput:
        ...

class AgentOutput(BaseModel):
    agent_name: str
    subtask_id: str
    result: dict
    confidence: float          # 0.0 – 1.0
    sources: list[str]
    tool_calls: list[ToolCallRecord]
    status: Literal["success","partial","failed"]
    reasoning_trace: str
```


**Agent Specifications:**

| Agent | Primary Tools | LLM Routing | Max Latency |
|---|---|---|---|
| DevOps | K8s API, CloudWatch, GitHub, log store | GPT-5 / Claude | 20s |
| Data Analyst | PostgreSQL, MongoDB, pandas, charting | GPT-5 | 25s |
| Research | Web search, KB vector search, doc parser | Claude / GPT-5 | 20s |
| Support | Jira API, Slack API, sentiment model | Claude | 15s |
| Security | Threat feeds, access logs, compliance rules | GPT-5 | 20s |
| Memory | Redis, PostgreSQL, Vector DB | Llama 3 (local) | 200ms |

---

### 3.4 Memory Agent

**Technology:** Redis (session) + PostgreSQL (long-term) + Pinecone/Weaviate (vector)

**Memory Tiers:**
```
┌─────────────────────────────────────────────────────┐
│  TIER 1: Session Memory (Redis)                     │
│  Scope: single workflow  │  TTL: workflow lifetime   │
│  Content: intermediate outputs, tool results        │
│  Access: <200ms guaranteed                          │
├─────────────────────────────────────────────────────┤
│  TIER 2: Long-Term Memory (PostgreSQL)              │
│  Scope: per-user, per-org  │  Retention: configurable│
│  Content: workflow outcomes, incidents, preferences │
│  Access: indexed queries                            │
├─────────────────────────────────────────────────────┤
│  TIER 3: Vector Memory (Pinecone/Weaviate)          │
│  Scope: org-wide knowledge  │  Retention: permanent  │
│  Content: embeddings, KB docs, workflow summaries   │
│  Access: semantic similarity search (cosine)        │
└─────────────────────────────────────────────────────┘
```

**Memory Agent Interface:**
```python
class MemoryAgent:
    async def get_session_context(workflow_id: str) -> SessionContext
    async def set_session_value(workflow_id: str, key: str, value: Any) -> None
    async def persist_workflow(workflow_id: str, outcome: WorkflowOutcome) -> None
    async def semantic_search(query: str, k: int, agent_id: str) -> list[MemoryEntry]
    async def inject_user_context(user_id: str) -> list[MemoryEntry]
    async def compress_context(context: SessionContext) -> SessionContext
    async def store_embedding(doc_id: str, content: str, metadata: dict) -> None
```

**Context Compression Strategy:**
- Trigger: session token count > 80% of LLM context window
- Strategy: keep last 10 entries + top-5 by relevance score
- Summarize dropped entries into a single compressed summary node

---

### 3.5 Decision Engine

**Technology:** LangGraph node + RAG pipeline

**Synthesis Pipeline:**
```
Agent Outputs (N)
  → Confidence Filter (flag < threshold)
  → Conflict Detector (identify contradictions)
  → RAG Grounding (cross-reference Vector_DB)
  → Output Formatter (structured summary + evidence)
  → Approval Checkpoint Injector
  → Final SynthesizedOutput
```

**Output Schema:**
```python
class SynthesizedOutput(BaseModel):
    workflow_id: str
    summary: str
    recommendations: list[Recommendation]
    supporting_evidence: list[Evidence]
    confidence_level: float
    unconfirmed_findings: list[Finding]   # confidence < threshold
    conflicts: list[Conflict]             # requires human review
    required_approvals: list[ApprovalCheckpoint]
    agent_contributions: dict[str, AgentOutput]
    generated_at: datetime
```

---

### 3.6 Human-in-the-Loop (HITL) System

**Approval Trigger Classification:**
```python
APPROVAL_TRIGGERS = {
    "prod_db_write":        ApprovalLevel.OPERATOR,
    "external_notification": ApprovalLevel.OPERATOR,
    "k8s_deployment":       ApprovalLevel.SENIOR_OPERATOR,
    "financial_action":     ApprovalLevel.MANAGER,
    "security_remediation": ApprovalLevel.SECURITY_OFFICER,
    "record_deletion":      ApprovalLevel.BLOCKED,  # never allowed
}
```

**Approval Workflow:**
```
Supervisor detects trigger
  → Create ApprovalCheckpoint record (PostgreSQL)
  → Suspend workflow (LangGraph interrupt)
  → Notify approver via Slack/email (within 30s)
  → Poll for decision (WebSocket push to dashboard)
  → On APPROVE: resume workflow from checkpoint
  → On REJECT: cancel action, log, resume with rejection noted
  → On TIMEOUT: escalate to next RBAC level
```


---

## 4. Data Models

### 4.1 PostgreSQL Schema

```sql
-- Users and RBAC
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    role            VARCHAR(50) NOT NULL,  -- operator, senior_operator, manager, security_officer, admin
    permissions     JSONB NOT NULL DEFAULT '[]',
    organization_id UUID NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Workflows
CREATE TABLE workflows (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    request_text    TEXT NOT NULL,
    status          VARCHAR(30) NOT NULL,  -- pending, running, degraded, completed, failed, awaiting_approval
    subtasks        JSONB NOT NULL DEFAULT '[]',
    final_output    JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    execution_time_ms INTEGER
);

-- Execution snapshots for checkpoint/resume
CREATE TABLE execution_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     UUID REFERENCES workflows(id),
    checkpoint_name VARCHAR(100) NOT NULL,
    state_blob      JSONB NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Approval checkpoints
CREATE TABLE approvals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     UUID REFERENCES workflows(id),
    action_type     VARCHAR(50) NOT NULL,
    action_payload  JSONB NOT NULL,
    approver_id     UUID REFERENCES users(id),
    status          VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, escalated, timed_out
    decision_at     TIMESTAMPTZ,
    comments        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable audit log
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor_id        UUID,
    actor_type      VARCHAR(20) NOT NULL,  -- user, agent, system
    action_type     VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     VARCHAR(255),
    outcome         VARCHAR(20) NOT NULL,  -- success, failure, denied
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Long-term memory
CREATE TABLE long_term_memory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    org_id          UUID NOT NULL,
    memory_type     VARCHAR(30) NOT NULL,  -- incident, preference, workflow_outcome
    content         TEXT NOT NULL,
    metadata        JSONB,
    embedding_id    VARCHAR(255),  -- reference to vector DB entry
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Token usage tracking
CREATE TABLE llm_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     UUID REFERENCES workflows(id),
    agent_name      VARCHAR(50) NOT NULL,
    model_name      VARCHAR(100) NOT NULL,
    provider        VARCHAR(50) NOT NULL,
    prompt_tokens   INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    latency_ms      INTEGER NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. LLM Provider Abstraction

```python
class LLMRouter:
    """Routes LLM calls to the appropriate provider with fallback."""

    PROVIDER_PRIORITY = ["openai_gpt5", "anthropic_claude", "ollama_llama3"]

    async def complete(
        self,
        messages: list[Message],
        agent_name: str,
        output_schema: type[BaseModel]
    ) -> LLMResponse:
        for provider in self.PROVIDER_PRIORITY:
            if await self._is_available(provider):
                try:
                    response = await self._call_provider(provider, messages, output_schema)
                    await self._record_usage(provider, agent_name, response)
                    return response
                except ProviderUnavailableError:
                    continue
        raise AllProvidersUnavailableError("No LLM provider available")

    def _get_provider_for_env(self) -> str:
        if settings.ENV == "development":
            return "ollama_llama3"
        return self.PROVIDER_PRIORITY[0]
```

---

## 6. Tool Specifications

### Tool Contract Interface
```python
class BaseTool(ABC):
    name: str
    description: str
    allowed_agents: list[str]
    timeout_seconds: int
    has_side_effects: bool
    requires_approval: bool

    @abstractmethod
    async def execute(self, params: BaseModel) -> ToolResult: ...

    async def validate_response(self, raw: dict) -> ToolResult: ...
    async def handle_error(self, error: Exception) -> ToolResult: ...
```


### Tool Registry

| Tool Name | Agent(s) | Side Effects | Approval Required | Timeout |
|---|---|---|---|---|
| kubernetes_get_metrics | devops | No | No | 10s |
| kubernetes_apply_config | devops | Yes | Yes | 30s |
| cloudwatch_get_logs | devops | No | No | 15s |
| github_get_pipeline | devops | No | No | 10s |
| postgres_query | analyst | No | No | 20s |
| postgres_write | analyst | Yes | Yes | 20s |
| mongodb_query | analyst | No | No | 20s |
| web_search | research | No | No | 15s |
| kb_vector_search | research | No | No | 5s |
| jira_get_ticket | support | No | No | 10s |
| jira_update_ticket | support | Yes | No | 10s |
| slack_send_message | support | Yes | Yes | 5s |
| access_log_query | security | No | No | 15s |
| threat_feed_query | security | No | No | 10s |
| compliance_check | security | No | No | 20s |
| security_remediate | security | Yes | Yes | 30s |

---

## 7. Failure Handling Design

### Circuit Breaker State Machine
```
CLOSED ──(failures >= threshold)──► OPEN
  ▲                                    │
  │                              (cooldown expires)
  │                                    ▼
  └──(probe succeeds)────────── HALF-OPEN
```

**Configuration:**
```python
class CircuitBreakerConfig(BaseModel):
    failure_threshold: int = 5        # consecutive failures to open
    cooldown_seconds: int = 60        # time in OPEN state
    probe_timeout_seconds: int = 10   # HALF-OPEN probe timeout
```

### Retry Policy
```python
class RetryPolicy(BaseModel):
    max_retries: int = 3              # range: 1-10
    base_delay_seconds: float = 1.0  # exponential backoff base
    multiplier: float = 2.0
    max_delay_seconds: float = 60.0
    # delay = min(base * multiplier^attempt, max_delay)
```

### Workflow Checkpoint/Resume
```
Workflow execution:
  [checkpoint: task_decomposed]
  [checkpoint: agent_X_complete]
  [checkpoint: all_agents_complete]
  [checkpoint: decision_synthesized]

On failure at any point:
  → Load last checkpoint snapshot from execution_snapshots table
  → Restore WorkflowState from snapshot
  → Resume LangGraph from that node
```

---

## 8. Observability Design

### OpenTelemetry Span Hierarchy
```
workflow.execute (root span)
  ├── supervisor.decompose
  ├── agent.devops.execute
  │     ├── tool.kubernetes_get_metrics
  │     └── llm.call (model=gpt-5, tokens=450)
  ├── agent.analyst.execute
  │     ├── tool.postgres_query
  │     └── llm.call (model=gpt-5, tokens=800)
  ├── memory.inject_context
  ├── decision_engine.synthesize
  │     └── llm.call (model=claude, tokens=1200)
  └── approval.checkpoint (if triggered)
```

### Prometheus Metrics
```
# Workflow metrics
omniops_workflow_total{status="completed|failed|degraded"}
omniops_workflow_duration_seconds{quantile="0.5|0.95|0.99"}

# Agent metrics
omniops_agent_invocations_total{agent="devops|analyst|..."}
omniops_agent_latency_seconds{agent, quantile}

# Tool metrics
omniops_tool_calls_total{tool, status="success|failure"}
omniops_circuit_breaker_state{tool, state="open|closed|half_open"}

# LLM metrics
omniops_llm_tokens_total{agent, model, provider, type="prompt|completion"}
omniops_llm_latency_seconds{model, provider}

# Approval metrics
omniops_approvals_pending_total
omniops_approval_response_time_seconds
```

---

## 9. Security Design

### RBAC Permission Matrix

| Role | Execute Workflow | Approve Prod Changes | Approve Financial | Approve Security | Admin |
|---|---|---|---|---|---|
| operator | ✓ | ✗ | ✗ | ✗ | ✗ |
| senior_operator | ✓ | ✓ | ✗ | ✗ | ✗ |
| manager | ✓ | ✓ | ✓ | ✗ | ✗ |
| security_officer | ✓ | ✓ | ✗ | ✓ | ✗ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ |

### Prompt Injection Filter
```python
INJECTION_PATTERNS = [
    r"ignore (previous|all|above) instructions",
    r"you are now",
    r"system prompt",
    r"jailbreak",
    r"<\|.*\|>",           # token injection
    r"\[INST\].*\[/INST\]", # instruction injection
]

def filter_prompt(text: str) -> FilterResult:
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return FilterResult(blocked=True, pattern_matched=pattern)
    return FilterResult(blocked=False)
```

### PII Masking
```python
PII_PATTERNS = {
    "email":   r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
    "phone":   r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b",
    "ssn":     r"\b\d{3}-\d{2}-\d{4}\b",
    "credit_card": r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b",
}
# Replacement: [MASKED_EMAIL], [MASKED_PHONE], etc.
```


---

## 10. Frontend Architecture

**Technology:** Next.js 14 (App Router) + React + Tailwind CSS + ShadCN UI

### Page Structure
```
/app
  /dashboard          → Workflow submission + active workflow list
  /workflows/[id]     → Workflow detail + live execution graph
  /approvals          → Pending approval queue
  /observability      → Token usage, latency, error heatmaps
  /agents             → Agent health and status
  /settings           → RBAC, integrations, LLM config
```

### Real-Time Updates
- **SSE (Server-Sent Events):** workflow status streaming via `/api/v1/workflows/{id}/stream`
- **WebSocket:** live execution graph updates
- **Polling fallback:** 5s interval for environments blocking SSE/WS

### Execution Graph Visualization
- Library: React Flow (node-based graph renderer)
- Nodes: one per agent invocation, color-coded by status
- Edges: directed arrows showing data flow between agents
- Live update: graph re-renders on each SSE event (≤5s latency)

---

## 11. Deployment Architecture

### Development (Docker Compose)
```yaml
services:
  api_gateway:      FastAPI app
  supervisor:       LangGraph worker
  agent_workers:    Celery workers (one per agent type)
  postgres:         PostgreSQL 16
  mongodb:          MongoDB 7
  redis:            Redis 7
  chromadb:         ChromaDB (local vector DB)
  ollama:           Ollama + Llama 3
  prometheus:       Prometheus
  grafana:          Grafana
  frontend:         Next.js dev server
```

### Production (Kubernetes / AWS EKS)
```
Namespace: omniops-prod
  Deployments:
    - api-gateway          (2–10 replicas, HPA on CPU/RPS)
    - supervisor-worker    (2–8 replicas, HPA on queue depth)
    - agent-devops         (1–5 replicas)
    - agent-analyst        (1–5 replicas)
    - agent-research       (1–5 replicas)
    - agent-support        (1–5 replicas)
    - agent-security       (1–5 replicas)
    - memory-agent         (2–4 replicas)
    - decision-engine      (2–4 replicas)
    - frontend             (2–6 replicas)

  StatefulSets:
    - postgresql           (primary + read replica)
    - redis-cluster        (3-node cluster)

  External Services (managed):
    - Pinecone / Weaviate  (vector DB)
    - AWS RDS PostgreSQL   (production DB)
    - AWS ElastiCache      (Redis)
```

### CI/CD Pipeline (GitHub Actions + ArgoCD)
```
Push to main branch:
  1. Run unit tests (pytest)
  2. Run integration tests
  3. Build Docker images
  4. Push to ECR
  5. Update Helm chart values
  6. ArgoCD detects change → Canary deploy (10% traffic)
  7. Monitor error rate for 10 minutes
  8. If error rate < threshold → promote to 100%
  9. If error rate >= threshold → auto-rollback
```

---

## 12. Project Folder Structure

```
omniops-ai/
├── backend/
│   ├── agents/
│   │   ├── base_agent.py
│   │   ├── supervisor/
│   │   │   ├── __init__.py
│   │   │   ├── supervisor_agent.py
│   │   │   ├── task_decomposer.py
│   │   │   └── workflow_state.py
│   │   ├── devops/
│   │   │   ├── devops_agent.py
│   │   │   └── prompts.py
│   │   ├── analyst/
│   │   │   ├── analyst_agent.py
│   │   │   └── prompts.py
│   │   ├── research/
│   │   │   ├── research_agent.py
│   │   │   └── prompts.py
│   │   ├── support/
│   │   │   ├── support_agent.py
│   │   │   └── prompts.py
│   │   ├── security/
│   │   │   ├── security_agent.py
│   │   │   └── prompts.py
│   │   └── memory/
│   │       ├── memory_agent.py
│   │       └── compression.py
│   ├── tools/
│   │   ├── base_tool.py
│   │   ├── circuit_breaker.py
│   │   ├── kubernetes_tools.py
│   │   ├── database_tools.py
│   │   ├── slack_tools.py
│   │   ├── jira_tools.py
│   │   ├── search_tools.py
│   │   └── security_tools.py
│   ├── workflows/
│   │   ├── graph_builder.py
│   │   └── approval_manager.py
│   ├── memory/
│   │   ├── session_store.py
│   │   ├── long_term_store.py
│   │   └── vector_store.py
│   ├── rag/
│   │   ├── embedder.py
│   │   ├── retriever.py
│   │   └── reranker.py
│   ├── api/
│   │   ├── main.py
│   │   ├── routes/
│   │   │   ├── execute.py
│   │   │   ├── tasks.py
│   │   │   ├── approvals.py
│   │   │   ├── agents.py
│   │   │   └── memory.py
│   │   └── middleware/
│   │       ├── auth.py
│   │       ├── rate_limit.py
│   │       └── injection_filter.py
│   ├── models/
│   │   ├── workflow.py
│   │   ├── agent_output.py
│   │   ├── approval.py
│   │   └── memory.py
│   ├── core/
│   │   ├── config.py
│   │   ├── llm_router.py
│   │   ├── rbac.py
│   │   ├── pii_masker.py
│   │   └── audit_logger.py
│   └── decision_engine/
│       ├── synthesizer.py
│       ├── conflict_detector.py
│       └── rag_grounder.py
├── frontend/
│   ├── app/
│   │   ├── dashboard/
│   │   ├── workflows/
│   │   ├── approvals/
│   │   └── observability/
│   ├── components/
│   │   ├── ExecutionGraph.tsx
│   │   ├── WorkflowCard.tsx
│   │   ├── ApprovalModal.tsx
│   │   └── TokenUsageChart.tsx
│   └── lib/
│       ├── api.ts
│       └── sse.ts
├── infrastructure/
│   ├── terraform/
│   │   ├── eks.tf
│   │   ├── rds.tf
│   │   └── elasticache.tf
│   ├── kubernetes/
│   │   ├── deployments/
│   │   ├── services/
│   │   └── hpa/
│   └── docker/
│       └── docker-compose.yml
├── observability/
│   ├── prometheus/
│   │   └── prometheus.yml
│   ├── grafana/
│   │   └── dashboards/
│   └── otel/
│       └── collector.yml
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── adversarial/
│   └── load/
└── docs/
```

---

## 13. Evaluation Framework

### Success Metrics
| Metric | Target | Measurement |
|---|---|---|
| Interactive query latency (p95) | < 30s | Prometheus histogram |
| Incident alert delivery | < 2s | OTel span |
| Task completion rate | > 95% | workflow status counts |
| Hallucination rate | < 5% | RAG grounding score |
| Token efficiency | < 2000 tokens/workflow avg | llm_usage table |
| Approval notification delivery | < 30s | approval created_at vs notified_at |

### Testing Strategy
- **Unit tests:** each agent, tool, circuit breaker, PII masker, prompt filter
- **Integration tests:** full workflow execution with mocked LLM + real DB
- **Adversarial tests:** prompt injection attempts, malformed tool responses, LLM hallucination injection
- **Load tests:** Locust — 200 concurrent users, 5k daily requests simulation
- **Chaos tests:** kill agent pods mid-workflow, simulate DB failover, LLM provider outage

---

## 14. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM hallucination in recommendations | High | High | RAG grounding + confidence scoring + human review for low-confidence outputs |
| Circular agent delegation | Medium | High | LangGraph enforces DAG — no cycles possible in StateGraph |
| Prompt injection via user input | Medium | Critical | Gateway-level injection filter + tool sandboxing |
| Vector DB unavailability | Low | Medium | Fallback to keyword search in PostgreSQL |
| LLM provider outage | Medium | High | Multi-provider fallback chain (GPT-5 → Claude → Llama 3) |
| Approval timeout cascade | Low | Medium | Escalation chain with configurable timeout per RBAC level |
| Context window overflow | High | Medium | Memory compression at 80% token threshold |
| PII leakage in logs | Medium | Critical | PII masking applied before any write to audit log or LTM |
