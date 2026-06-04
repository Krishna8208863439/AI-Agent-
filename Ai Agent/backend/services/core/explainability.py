"""
Explainability Engine — generates human-readable reasoning traces.
"""
import datetime, logging
from typing import Dict, Any, List

logger = logging.getLogger("explainability")

class ExplainabilityEngine:
    def __init__(self):
        self.traces: Dict[str, Dict] = {}

    def generate_explanation(self, workflow_id: str, prompt: str,
                              agent_outputs: Dict[str, Any],
                              synthesis: Dict[str, Any]) -> Dict:
        steps = []
        for agent, output in agent_outputs.items():
            if not output:
                continue
            steps.append({
                "step": len(steps) + 1,
                "agent": agent,
                "finding": output.get("insight", "No insight"),
                "confidence": output.get("confidence", 0.0),
                "tools_used": output.get("tools_used", []),
                "reasoning": f"{agent} Agent analyzed the request using domain-specific tools "
                             f"and produced a finding with {output.get('confidence', 0)*100:.0f}% confidence.",
                "sources": output.get("sources", ["internal_tools"])
            })

        risk_level = "LOW"
        checkpoints = synthesis.get("checkpoints_required", [])
        if any(c["action_type"] in ("DEPLOYMENT", "SECURITY_REMEDIATION") for c in checkpoints):
            risk_level = "MEDIUM"
        if any(c["action_type"] == "FINANCIAL" for c in checkpoints):
            risk_level = "HIGH"

        alternatives = []
        if synthesis.get("conflict_detected"):
            alternatives.append("Multiple conflicting recommendations detected — human review required")

        explanation = {
            "workflow_id": workflow_id,
            "original_request": prompt,
            "reasoning_steps": steps,
            "final_recommendation": synthesis.get("summary", ""),
            "confidence_level": synthesis.get("confidence_level", 0.0),
            "risk_assessment": risk_level,
            "alternatives_considered": alternatives,
            "approval_requirements": checkpoints,
            "rag_grounding": len(synthesis.get("grounding_context", [])) > 0,
            "generated_at": datetime.datetime.utcnow().isoformat()
        }
        self.traces[workflow_id] = explanation
        return explanation

    def get_trace(self, workflow_id: str) -> Dict | None:
        return self.traces.get(workflow_id)

    def get_all_traces(self, limit: int = 20) -> List[Dict]:
        return list(self.traces.values())[-limit:]

explainability_engine = ExplainabilityEngine()
