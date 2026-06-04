import logging
from typing import Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from fastapi.responses import Response

from db.database import engine, get_db, Base
from db.models import Workflow, SubTask, ApprovalCheckpoint, AuditLog
from supervisor.orchestrator import supervisor_orchestrator
from pydantic import BaseModel

# Initialize DB tables (for easy local setup)
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("core_services")

app = FastAPI(title="OmniOps AI Core Services", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics setup (Req 9.2)
WORKFLOW_COUNTER = Counter("workflows_started_total", "Total count of started workflows")
WORKFLOW_LATENCY = Histogram("workflow_duration_seconds", "Latency of workflow execution in seconds")
AGENT_TOKEN_USAGE = Counter("agent_tokens_total", "Total tokens used per agent", ["agent"])
CIRCUIT_BREAKER_STATE = Counter("circuit_breaker_tripped_total", "Circuit breaker trips", ["tool"])

class StartWorkflowRequest(BaseModel):
    prompt: str
    user_id: str
    role: str = "operator"
    metadata: Optional[Dict[str, Any]] = None

class ApproveCheckpointRequest(BaseModel):
    checkpoint_id: str
    approved: bool
    actor: str = "operator"

@app.post("/workflow/start")
async def start_workflow(req: StartWorkflowRequest, db: Session = Depends(get_db)):
    WORKFLOW_COUNTER.inc()
    try:
        workflow_id = await supervisor_orchestrator.execute_workflow(
            db=db,
            prompt=req.prompt,
            user_id=req.user_id,
            metadata=req.metadata
        )
        return {"workflow_id": workflow_id, "status": "initiated"}
    except Exception as e:
        logger.error(f"Error starting workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/workflow/list")
def list_workflows(db: Session = Depends(get_db)):
    workflows = db.query(Workflow).order_by(Workflow.created_at.desc()).all()
    # Serialize cleanly
    return [
        {
            "id": w.id,
            "prompt": w.prompt,
            "user_id": w.user_id,
            "status": w.status,
            "created_at": w.created_at.isoformat(),
            "completed_at": w.completed_at.isoformat() if w.completed_at else None,
            "metadata_json": w.metadata_json
        }
        for w in workflows
    ]

@app.get("/workflow/status/{workflow_id}")
def get_workflow_status(workflow_id: str, db: Session = Depends(get_db)):
    workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    subtasks = db.query(SubTask).filter(SubTask.workflow_id == workflow_id).all()
    checkpoints = db.query(ApprovalCheckpoint).filter(ApprovalCheckpoint.workflow_id == workflow_id).all()
    
    # Calculate simple percentage completion based on subtasks
    completion_percentage = 0
    if subtasks:
        completed = sum(1 for st in subtasks if st.status in ["COMPLETED", "FAILED"])
        completion_percentage = int((completed / len(subtasks)) * 100)
    elif workflow.status == "COMPLETED":
        completion_percentage = 100

    return {
        "id": workflow.id,
        "prompt": workflow.prompt,
        "user_id": workflow.user_id,
        "status": workflow.status,
        "completion_percentage": completion_percentage,
        "created_at": workflow.created_at.isoformat(),
        "completed_at": workflow.completed_at.isoformat() if workflow.completed_at else None,
        "metadata_json": workflow.metadata_json,
        "subtasks": [
            {
                "id": s.id,
                "title": s.title,
                "description": s.description,
                "agent_domain": s.agent_domain,
                "status": s.status,
                "result": s.result,
                "confidence": s.confidence,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None
            }
            for s in subtasks
        ],
        "checkpoints": [
            {
                "id": cp.id,
                "action_type": cp.action_type,
                "description": cp.description,
                "status": cp.status,
                "assigned_role": cp.assigned_role,
                "created_at": cp.created_at.isoformat()
            }
            for cp in checkpoints
        ]
    }

@app.post("/workflow/approve")
async def approve_checkpoint(req: ApproveCheckpointRequest, db: Session = Depends(get_db)):
    try:
        new_status = await supervisor_orchestrator.resolve_checkpoint(
            db=db,
            checkpoint_id=req.checkpoint_id,
            approved=req.approved,
            actor=req.actor
        )
        return {"status": new_status}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error approving checkpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/metrics")
def get_metrics():
    """
    Req 9.2: Expose Prometheus metrics.
    """
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/audit")
def get_audit_logs(db: Session = Depends(get_db)):
    """
    Req 8.2: Immutable audit logs output.
    """
    logs = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).all()
    return [
        {
            "id": l.id,
            "timestamp": l.timestamp.isoformat(),
            "actor": l.actor,
            "action_type": l.action_type,
            "details": l.details,
            "outcome": l.outcome
        }
        for l in logs
    ]

# ── NEW ADVANCED FEATURE ROUTES ──────────────────────────────

import uuid as uuid_lib
from core.rlhf import rlhf_engine
from core.scheduler import scheduler
from core.predictive import predictive_engine
from core.knowledge_graph import knowledge_graph
from core.constitution import constitution
from core.explainability import explainability_engine

# RLHF
@app.post("/rlhf/feedback")
async def submit_rlhf_feedback(req: dict, db: Session = Depends(get_db)):
    rlhf_engine.record_feedback(
        workflow_id=req.get("workflow_id", ""),
        agent=req.get("agent", ""),
        output=req.get("output", {}),
        approved=req.get("approved", True),
        actor=req.get("actor", "operator"),
        comments=req.get("comments", "")
    )
    return {"status": "recorded"}

@app.get("/rlhf/stats")
def get_rlhf_stats():
    return rlhf_engine.get_stats()

@app.get("/rlhf/recent")
def get_rlhf_recent():
    return rlhf_engine.get_recent()

@app.get("/rlhf/dataset")
def get_rlhf_dataset():
    return rlhf_engine.export_dataset()

# Scheduler
@app.post("/scheduler/jobs")
async def create_scheduled_job(req: dict):
    job_id = scheduler.add_job(
        name=req.get("name", "Unnamed Job"),
        prompt=req.get("prompt", ""),
        cron_expr=req.get("cron_expr", "@daily"),
        user_id=req.get("user_id", "operator"),
        auto_approve=req.get("auto_approve", False)
    )
    return {"job_id": job_id, "status": "created"}

@app.get("/scheduler/jobs")
def list_scheduled_jobs():
    return scheduler.list_jobs()

@app.delete("/scheduler/jobs/{job_id}")
def delete_scheduled_job(job_id: str):
    removed = scheduler.remove_job(job_id)
    return {"removed": removed}

@app.post("/scheduler/jobs/{job_id}/toggle")
def toggle_scheduled_job(job_id: str):
    enabled = scheduler.toggle_job(job_id)
    return {"enabled": enabled}

# Predictive
@app.get("/predictive/metrics")
def get_predictive_metrics():
    return predictive_engine.get_current_metrics()

@app.get("/predictive/alerts")
def get_predictive_alerts():
    return predictive_engine.get_alerts()

@app.post("/predictive/ingest")
async def ingest_metric(req: dict):
    predictive_engine.ingest(req.get("metric", ""), float(req.get("value", 0)))
    return {"status": "ingested"}

# Knowledge Graph
@app.get("/kg/graph")
def get_knowledge_graph():
    return knowledge_graph.to_graph_data()

@app.get("/kg/search")
def search_knowledge_graph(q: str = ""):
    return knowledge_graph.search(q)

@app.get("/kg/causes/{node_id}")
def get_causes(node_id: str):
    return knowledge_graph.query_causes(node_id)

@app.post("/kg/nodes")
async def add_kg_node(req: dict):
    node = knowledge_graph.add_node(
        req.get("node_id", str(uuid_lib.uuid4())),
        req.get("node_type", "incident"),
        req.get("label", ""),
        req.get("properties", {})
    )
    return {"node_id": node.node_id}

# Constitution
@app.post("/constitution/evaluate")
async def evaluate_action(req: dict):
    allowed, violations = constitution.evaluate(
        req.get("action", ""), req.get("payload", {})
    )
    return {"allowed": allowed, "violations": violations}

@app.get("/constitution/violations")
def get_violations():
    return constitution.get_violations()

@app.get("/constitution/stats")
def get_constitution_stats():
    return constitution.get_stats()

# Explainability
@app.get("/explain/{workflow_id}")
def get_explanation(workflow_id: str, db: Session = Depends(get_db)):
    trace = explainability_engine.get_trace(workflow_id)
    if not trace:
        workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()
        if workflow and workflow.metadata_json:
            synthesis = workflow.metadata_json.get("synthesis", {})
            subtasks = db.query(SubTask).filter(SubTask.workflow_id == workflow_id).all()
            agent_outputs = {s.agent_domain: s.result for s in subtasks if s.result}
            trace = explainability_engine.generate_explanation(
                workflow_id, workflow.prompt, agent_outputs, synthesis
            )
    return trace or {"error": "No trace found"}

@app.get("/explain")
def get_all_explanations():
    return explainability_engine.get_all_traces()

# System health extended
@app.get("/system/health")
def system_health():
    return {
        "status": "healthy",
        "services": {
            "api": "online",
            "supervisor": "online",
            "agents": {a: "online" for a in ["DevOps", "Data", "Research", "Support", "Security", "Memory"]},
            "rlhf": "online",
            "scheduler": "online",
            "predictive": "online",
            "knowledge_graph": "online",
            "constitution": "online"
        },
        "metrics": {
            "workflows_total": 0,
            "rlhf_signals": len(rlhf_engine.feedback_store),
            "scheduled_jobs": len(scheduler.jobs),
            "predictive_alerts": len(predictive_engine.alerts),
            "kg_nodes": len(knowledge_graph.nodes),
            "constitution_violations": len(constitution.violations)
        }
    }
