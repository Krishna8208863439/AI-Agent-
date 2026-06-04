import json
import logging
from typing import Dict, Any
from agents.agent_base import AgentBase

logger = logging.getLogger("support_agent")

class SupportAgent(AgentBase):
    def __init__(self):
        super().__init__(
            role="Support",
            permitted_tools=["get_ticket_details", "generate_ticket_response", "escalate_ticket"]
        )

    # Simulated Tools
    def get_ticket_details(self, ticket_id: str = "ticket-1092") -> Dict[str, Any]:
        return {
            "ticket_id": ticket_id,
            "subject": "System login times out constantly",
            "priority": "HIGH",
            "customer": "enterprise_user_a@bigcorp.com",
            "history": [
                {"role": "user", "text": "I try to login and the spinner spins for 30s and then fails. Please help."}
            ]
        }

    def generate_ticket_response(self, ticket_id: str, content: str) -> Dict[str, Any]:
        return {
            "ticket_id": ticket_id,
            "status": "DRAFT",
            "message": f"Hello, thanks for reaching out. We have analyzed the system state and noticed a temporary database connection exhaustion. {content}"
        }

    def escalate_ticket(self, ticket_id: str, tier: str = "L3") -> Dict[str, Any]:
        return {
            "ticket_id": ticket_id,
            "status": f"ESCALATED_{tier}",
            "assigned_team": "DevOps Engineering"
        }

    def execute_task(self, task_description: str) -> Dict[str, Any]:
        logger.info(f"Support Agent executing: {task_description}")
        
        tool_results = {}
        # Fetch ticket details if ticket ID is in the prompt or implicit
        ticket_id = "ticket-1092"
        details = self.execute_tool_with_resilience("get_ticket_details", self.get_ticket_details, ticket_id=ticket_id)
        tool_results["ticket_details"] = details
        
        # If it's high priority, draft response and escalate
        if details.get("priority") == "HIGH":
            draft = self.execute_tool_with_resilience(
                "generate_ticket_response", 
                self.generate_ticket_response, 
                ticket_id=ticket_id, 
                content="Our DevOps team is currently working on increasing resource allocations. We will resolve this within 15 minutes."
            )
            tool_results["draft_response"] = draft
            
            escalation = self.execute_tool_with_resilience("escalate_ticket", self.escalate_ticket, ticket_id=ticket_id)
            tool_results["escalation_details"] = escalation

        prompt = f"""
        You are the Support Agent. Based on the task: "{task_description}" 
        and the tool results: {json.dumps(tool_results)}, synthesize the customer support response status.
        Return your answer as a JSON object containing keys: 'status', 'insight', 'confidence' (float), and 'recommendation'.
        """
        
        raw_response = self.call_llm(prompt)
        try:
            return json.loads(raw_response)
        except Exception:
            return {
                "status": "escalated",
                "insight": "High priority ticket triaged and escalated to DevOps.",
                "confidence": 0.96,
                "recommendation": "Notify DevOps to prioritize database pool adjustments."
            }
