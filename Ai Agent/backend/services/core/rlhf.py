"""
RLHF Loop — Reinforcement Learning from Human Feedback
Stores approval/rejection signals and builds fine-tuning dataset.
"""
import json, datetime, logging
from typing import Dict, Any, List
from db.database import SessionLocal
from db.models import AuditLog

logger = logging.getLogger("rlhf")

class RLHFEngine:
    def __init__(self):
        self.feedback_store: List[Dict] = []

    def record_feedback(self, workflow_id: str, agent: str, output: Dict,
                        approved: bool, actor: str, comments: str = ""):
        entry = {
            "workflow_id": workflow_id,
            "agent": agent,
            "output": output,
            "approved": approved,
            "actor": actor,
            "comments": comments,
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "signal": 1.0 if approved else -1.0
        }
        self.feedback_store.append(entry)
        logger.info(f"RLHF signal recorded: agent={agent} approved={approved}")
        db = SessionLocal()
        try:
            db.add(AuditLog(actor=actor, action_type="RLHF_FEEDBACK",
                            details={"workflow_id": workflow_id, "agent": agent, "approved": approved},
                            outcome="SUCCESS"))
            db.commit()
        finally:
            db.close()

    def get_stats(self) -> Dict[str, Any]:
        if not self.feedback_store:
            return {"total": 0, "approval_rate": 0.0, "by_agent": {}}
        total = len(self.feedback_store)
        approved = sum(1 for f in self.feedback_store if f["approved"])
        by_agent: Dict[str, Dict] = {}
        for f in self.feedback_store:
            a = f["agent"]
            if a not in by_agent:
                by_agent[a] = {"total": 0, "approved": 0}
            by_agent[a]["total"] += 1
            if f["approved"]:
                by_agent[a]["approved"] += 1
        for a in by_agent:
            t = by_agent[a]["total"]
            by_agent[a]["approval_rate"] = round(by_agent[a]["approved"] / t, 3) if t else 0
        return {"total": total, "approval_rate": round(approved / total, 3), "by_agent": by_agent}

    def export_dataset(self) -> List[Dict]:
        """Export as fine-tuning dataset (prompt/completion pairs)."""
        dataset = []
        for f in self.feedback_store:
            if f["approved"]:
                dataset.append({
                    "prompt": f"Agent: {f['agent']}\nTask output: {json.dumps(f['output'])}",
                    "completion": "APPROVED",
                    "weight": 1.0
                })
            else:
                dataset.append({
                    "prompt": f"Agent: {f['agent']}\nTask output: {json.dumps(f['output'])}",
                    "completion": f"REJECTED: {f.get('comments', 'no reason')}",
                    "weight": -1.0
                })
        return dataset

    def get_recent(self, limit: int = 20) -> List[Dict]:
        return self.feedback_store[-limit:]

rlhf_engine = RLHFEngine()
