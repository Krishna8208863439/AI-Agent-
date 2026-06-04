import uuid
import asyncio
import logging
from typing import Dict, Any, List
import datetime
from sqlalchemy.orm import Session

from db.models import Workflow, SubTask, ApprovalCheckpoint, AuditLog
from agents.devops_agent import DevOpsAgent
from agents.data_agent import DataAnalystAgent
from agents.research_agent import ResearchAgent
from agents.support_agent import SupportAgent
from agents.security_agent import SecurityAgent
from decision_engine.synthesis import decision_engine
from memory.memory_manager import memory_manager

logger = logging.getLogger("supervisor_orchestrator")

# Instantiate agent singletons
agents_map = {
    "DevOps": DevOpsAgent(),
    "Data": DataAnalystAgent(),
    "Research": ResearchAgent(),
    "Support": SupportAgent(),
    "Security": SecurityAgent()
}

class SupervisorOrchestrator:
    def __init__(self):
        pass

    def decompose_task(self, prompt: str) -> List[Dict[str, Any]]:
        """
        Req 2.1: Decompose user prompt into specific subtasks within 2 seconds.
        This rule-based mapper performs instant (sub-millisecond) decomposition.
        """
        subtasks = []
        prompt_lower = prompt.lower()

        # Check DevOps tasks
        if any(w in prompt_lower for w in ["k8s", "kubernetes", "pod", "logs", "build", "pipeline", "ci/cd", "latency"]):
            subtasks.append({
                "title": "Analyze Infrastructure Logs and Metrics",
                "description": "Inspect Kubernetes pods, CPU/Memory spikes, and check auth service failures.",
                "domain": "DevOps"
            })

        # Check Support tasks
        if any(w in prompt_lower for w in ["ticket", "customer", "support", "complain", "client"]):
            subtasks.append({
                "title": "Triage Customer Support Ticket",
                "description": "Examine high priority tickets, priority, sentiment, and draft a response.",
                "domain": "Support"
            })

        # Check Security tasks
        if any(w in prompt_lower for w in ["security", "hack", "login attempts", "ip", "anomaly", "vuln", "vulnerability"]):
            subtasks.append({
                "title": "Security Risk Assessment",
                "description": "Check access log failures and evaluate network/IP attack risk.",
                "domain": "Security"
            })

        # Check Data Analyst tasks
        if any(w in prompt_lower for w in ["report", "sql", "dashboard", "metric", "mrr", "churn", "sales"]):
            subtasks.append({
                "title": "Query Business KPIs",
                "description": "Run analytical SQL query to extract conversion rates and revenue changes.",
                "domain": "Data"
            })

        # Check Research tasks
        if any(w in prompt_lower for w in ["research", "competitor", "runbook", "docs", "knowledge base"]):
            subtasks.append({
                "title": "Research Knowledge Base and Runbooks",
                "description": "Search the internal documentation and runbooks for incident resolution templates.",
                "domain": "Research"
            })

        # Fallback if no keywords matched: assign general research & triage
        if not subtasks:
            subtasks.append({
                "title": "General System Triage & Research",
                "description": "Perform knowledge base query to find incident resolutions for: " + prompt,
                "domain": "Research"
            })

        return subtasks

    async def execute_workflow(self, db: Session, prompt: str, user_id: str, metadata: Dict[str, Any] = None) -> str:
        """
        Orchestrates and executes the subtasks, updating state.
        """
        workflow_id = str(uuid.uuid4())
        
        # 1. Save workflow initial state to database
        db_workflow = Workflow(
            id=workflow_id,
            prompt=prompt,
            user_id=user_id,
            status="RUNNING",
            metadata_json=metadata
        )
        db.add(db_workflow)
        db.commit()

        # Audit initial event
        audit = AuditLog(
            actor=user_id,
            action_type="WORKFLOW_INIT",
            details={"prompt": prompt, "workflow_id": workflow_id},
            outcome="SUCCESS"
        )
        db.add(audit)
        db.commit()

        # 2. Retrieve prior user workflows from Long_Term_Memory (Req 4.5)
        long_term_context = memory_manager.semantic_search(f"User {user_id} prior workflows", k=1)
        if long_term_context:
            logger.info(f"Retrieved prior workflows context: {long_term_context[0]['text']}")

        # 3. Decompose task
        subtasks_data = self.decompose_task(prompt)
        
        # Add subtasks to database (Req 2.5)
        db_subtasks = []
        for i, st in enumerate(subtasks_data):
            db_st = SubTask(
                id=f"{workflow_id}-st-{i}",
                workflow_id=workflow_id,
                title=st["title"],
                description=st["description"],
                agent_domain=st["domain"],
                status="PENDING",
                confidence=0.0
            )
            db.add(db_st)
            db_subtasks.append(db_st)
        db.commit()

        # 4. Execute subtasks (Req 2.2, 2.3 & 2.4)
        # For simplicity, execute tasks asynchronously
        async def run_subtask(subtask: SubTask):
            subtask.status = "RUNNING"
            db.commit()
            
            agent = agents_map.get(subtask.agent_domain)
            if not agent:
                subtask.status = "FAILED"
                subtask.result = {"error": f"No agent loaded for domain {subtask.agent_domain}"}
                db.commit()
                return

            try:
                # Simulate network delay for realistic visual frontend flow
                await asyncio.sleep(1.0)
                
                # Execute agent task
                result = agent.execute_task(subtask.description)
                
                subtask.status = "COMPLETED"
                subtask.result = result
                subtask.confidence = result.get("confidence", 0.90)
                subtask.completed_at = datetime.datetime.utcnow()
                db.commit()

                # Save intermediate result to Session_Memory (Req 4.1)
                memory_manager.store_session_context(workflow_id, {
                    "step": subtask.title,
                    "agent": subtask.agent_domain,
                    "result": result
                })
            except Exception as e:
                logger.error(f"Error running subtask {subtask.id}: {e}")
                subtask.status = "FAILED"
                subtask.result = {"error": str(e)}
                db.commit()

        # Run concurrent subtasks (Req 2.3)
        await asyncio.gather(*[run_subtask(st) for st in db_subtasks])

        # 5. Synthesize outputs using Decision Engine (Req 2.6 & Req 6)
        # Collect outputs
        agent_outputs = {}
        for st in db_subtasks:
            if st.status == "COMPLETED" and st.result:
                agent_outputs[st.agent_domain] = st.result

        # Synthesize final recommendation
        synthesis = decision_engine.synthesize_outputs(prompt, agent_outputs)
        
        # 6. Check for Approval Checkpoints (Req 5 & 12.3)
        # If the synthesis flags checkpoints, pause/suspend workflow
        if synthesis.get("checkpoints_required"):
            db_workflow.status = "SUSPENDED"
            db_workflow.metadata_json = {
                "synthesis": synthesis,
                "partial_outputs": agent_outputs
            }
            db.commit()

            # Save checkoints to DB
            for idx, cp in enumerate(synthesis["checkpoints_required"]):
                checkpoint = ApprovalCheckpoint(
                    id=f"{workflow_id}-cp-{idx}",
                    workflow_id=workflow_id,
                    action_type=cp["action_type"],
                    description=cp["description"],
                    status="PENDING",
                    assigned_role="operator"
                )
                db.add(checkpoint)
            db.commit()
            
            logger.info(f"Workflow {workflow_id} suspended due to required approval checkpoints.")
            return workflow_id

        # 7. Complete workflow (if no checkpoints needed)
        db_workflow.status = "COMPLETED"
        db_workflow.completed_at = datetime.datetime.utcnow()
        db_workflow.metadata_json = {"synthesis": synthesis}
        db.commit()

        # Persist to Long Term Memory (Req 4.2)
        memory_manager.persist_long_term_memory(
            doc_id=workflow_id,
            document_text=f"Prompt: {prompt}. Summary: {synthesis['summary']}",
            metadata={"user_id": user_id, "type": "workflow_outcome"}
        )

        return workflow_id

    async def resolve_checkpoint(self, db: Session, checkpoint_id: str, approved: bool, actor: str) -> str:
        """
        Req 5.8: Handles human approval or rejection of checkpoints.
        """
        checkpoint = db.query(ApprovalCheckpoint).filter(ApprovalCheckpoint.id == checkpoint_id).first()
        if not checkpoint:
            raise ValueError("Checkpoint not found")

        checkpoint.status = "APPROVED" if approved else "REJECTED"
        checkpoint.resolved_at = datetime.datetime.utcnow()
        db.commit()

        # Log to immutable audit log (Req 8.2)
        audit = AuditLog(
            actor=actor,
            action_type="APPROVAL_RESOLVED",
            details={"checkpoint_id": checkpoint_id, "approved": approved},
            outcome="SUCCESS"
        )
        db.add(audit)
        db.commit()

        # Check if all checkpoints for this workflow are resolved
        workflow_id = checkpoint.workflow_id
        pending_checkpoints = db.query(ApprovalCheckpoint).filter(
            ApprovalCheckpoint.workflow_id == workflow_id,
            ApprovalCheckpoint.status == "PENDING"
        ).count()

        workflow = db.query(Workflow).filter(Workflow.id == workflow_id).first()

        if pending_checkpoints == 0:
            # Check if any checkpoint was rejected
            rejected_checkpoints = db.query(ApprovalCheckpoint).filter(
                ApprovalCheckpoint.workflow_id == workflow_id,
                ApprovalCheckpoint.status == "REJECTED"
            ).count()

            if rejected_checkpoints > 0:
                # Cancel workflow/mark degraded if rejected (Req 5.8)
                workflow.status = "DEGRADED"
                logger.info(f"Workflow {workflow_id} resumed in DEGRADED status due to checkpoint rejection.")
            else:
                workflow.status = "COMPLETED"
                logger.info(f"Workflow {workflow_id} successfully COMPLETED after approvals.")

            workflow.completed_at = datetime.datetime.utcnow()
            db.commit()

            # Save to long term memory
            memory_manager.persist_long_term_memory(
                doc_id=workflow_id,
                document_text=f"Workflow completed post-approval. Prompt: {workflow.prompt}.",
                metadata={"user_id": workflow.user_id, "type": "workflow_outcome"}
            )

        return workflow.status

supervisor_orchestrator = SupervisorOrchestrator()
