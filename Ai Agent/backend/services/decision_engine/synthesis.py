import logging
from typing import Dict, Any, List
from memory.memory_manager import memory_manager

logger = logging.getLogger("decision_engine")

class DecisionEngine:
    def __init__(self, min_confidence_threshold: float = 0.85):
        self.min_confidence_threshold = min_confidence_threshold

    def synthesize_outputs(self, workflow_prompt: str, agent_outputs: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """
        Req 6.1: Synthesize outputs from multiple agents into a single recommendation.
        """
        logger.info(f"Synthesizing outputs for workflow: {workflow_prompt}")

        # 1. Retrieve grounding context from Vector DB (Req 6.2 - RAG Grounding)
        grounding_data = memory_manager.semantic_search(workflow_prompt, k=2)
        grounding_snippets = [item["text"] for item in grounding_data]

        # 2. Extract agent findings and evaluate confidence scores
        structured_summary = []
        low_confidence_flags = []
        supporting_evidence = []
        checkpoints_required = []
        
        roles_processed = list(agent_outputs.keys())
        
        # Check for conflicts (Req 6.5)
        # e.g. If DevOps says "system degraded" but Data Analyst says "performance spkied successfully (healthy)"
        # Simple conflict check based on positive/negative sentiment status keywords
        statuses = [out.get("status", "").lower() for out in agent_outputs.values()]
        has_conflict = False
        if ("degraded" in statuses or "failed" in statuses) and ("completed" in statuses or "secure" in statuses):
            has_conflict = True

        for agent_role, output in agent_outputs.items():
            confidence = output.get("confidence", 0.0)
            status = output.get("status", "UNKNOWN")
            insight = output.get("insight", "No insight provided.")
            recommendation = output.get("recommendation", "No recommendation.")

            # Req 6.3: Flag low confidence findings
            if confidence < self.min_confidence_threshold:
                low_confidence_flags.append({
                    "agent": agent_role,
                    "finding": insight,
                    "confidence": confidence
                })
                structured_summary.append(f"[{agent_role}] (LOW CONFIDENCE - {confidence:.2f}) {insight}")
            else:
                structured_summary.append(f"[{agent_role}] (CONFIRMED - {confidence:.2f}) {insight}")

            supporting_evidence.append({
                "agent": agent_role,
                "evidence": f"Recommendation: {recommendation}. Status: {status}."
            })

            # Check if approval checkpoints are triggered by this agent's recommendations (Req 5)
            rec_lower = recommendation.lower()
            if "restart" in rec_lower or "reboot" in rec_lower or "deploy" in rec_lower:
                checkpoints_required.append({
                    "action_type": "DEPLOYMENT",
                    "description": f"Approve deployment modification: {recommendation}"
                })
            elif "delete" in rec_lower or "write" in rec_lower or "update" in rec_lower:
                checkpoints_required.append({
                    "action_type": "DB_WRITE",
                    "description": f"Approve production database modification: {recommendation}"
                })
            elif "block" in rec_lower or "firewall" in rec_lower or "remediation" in rec_lower:
                checkpoints_required.append({
                    "action_type": "SECURITY_REMEDIATION",
                    "description": f"Approve security configuration change: {recommendation}"
                })
            elif "pay" in rec_lower or "cost" in rec_lower or "financial" in rec_lower:
                checkpoints_required.append({
                    "action_type": "FINANCIAL",
                    "description": f"Approve cost/financial transaction: {recommendation}"
                })
            elif "email" in rec_lower or "notify" in rec_lower or "send" in rec_lower:
                checkpoints_required.append({
                    "action_type": "EXTERNAL_COMM",
                    "description": f"Approve sending external communication: {recommendation}"
                })

        # Final synthesis
        average_confidence = sum([out.get("confidence", 0.0) for out in agent_outputs.values()]) / max(len(agent_outputs), 1)

        # Build response schema (Req 6.4)
        response = {
            "summary": " ".join(structured_summary),
            "grounding_context": grounding_snippets,
            "supporting_evidence": supporting_evidence,
            "confidence_level": round(average_confidence, 2),
            "low_confidence_flags": low_confidence_flags,
            "checkpoints_required": checkpoints_required,
            "conflict_detected": has_conflict
        }

        if has_conflict:
            response["summary"] += " [CONFLICT DETECTED: Agents returned conflicting health diagnostics. Manual operator review is required.]"

        return response

decision_engine = DecisionEngine()
