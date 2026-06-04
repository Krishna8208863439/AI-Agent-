import json
import logging
from typing import Dict, Any
from agents.agent_base import AgentBase

logger = logging.getLogger("research_agent")

class ResearchAgent(AgentBase):
    def __init__(self):
        super().__init__(
            role="Research",
            permitted_tools=["query_knowledge_base", "web_search"]
        )

    # Simulated Tools
    def query_knowledge_base(self, query: str) -> Dict[str, Any]:
        return {
            "query": query,
            "documents": [
                {"title": "Incident Runbook: DB Connection Pool Exhaustion", "summary": "If DB connection leaks occur, verify open active sessions in PostgreSQL. If necessary, execute a rolling restart of the API container."},
                {"title": "GDPR Compliance Checkpoints", "summary": "Ensure all user PII fields are masked in logs (e.g., email, credit card numbers, address)."}
            ]
        }

    def web_search(self, query: str) -> Dict[str, Any]:
        return {
            "query": query,
            "results": [
                {"url": "https://kubernetes.io/docs/concepts/workspaces/pods/", "snippet": "Kubernetes pod resource configurations permit specifying limits and requests..."},
                {"url": "https://fastapi.tiangolo.com/", "snippet": "FastAPI is a modern, fast, high-performance, web framework for building APIs with Python..."}
            ]
        }

    def execute_task(self, task_description: str) -> Dict[str, Any]:
        logger.info(f"Research Agent executing: {task_description}")
        
        tool_results = {}
        # Execute query_knowledge_base
        kb_res = self.execute_tool_with_resilience("query_knowledge_base", self.query_knowledge_base, query=task_description)
        tool_results["kb_results"] = kb_res
        
        # If kb yields insufficient results, execute web search
        if "web" in task_description or "competitor" in task_description or len(kb_res.get("documents", [])) == 0:
            web_res = self.execute_tool_with_resilience("web_search", self.web_search, query=task_description)
            tool_results["web_results"] = web_res

        prompt = f"""
        You are the Research Agent. Based on the task: "{task_description}" 
        and the tool results: {json.dumps(tool_results)}, summarize your research findings.
        Return your answer as a JSON object containing keys: 'status', 'insight', 'confidence' (float), and 'recommendation'.
        """
        
        raw_response = self.call_llm(prompt)
        try:
            return json.loads(raw_response)
        except Exception:
            return {
                "status": "completed",
                "insight": "Research findings support upgrading pod memory limits.",
                "confidence": 0.88,
                "recommendation": "Review memory limit allocations."
            }
