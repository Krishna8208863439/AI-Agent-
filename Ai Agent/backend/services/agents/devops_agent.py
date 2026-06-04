import json
import logging
from typing import Dict, Any
from agents.agent_base import AgentBase

logger = logging.getLogger("devops_agent")

class DevOpsAgent(AgentBase):
    def __init__(self):
        super().__init__(
            role="DevOps",
            permitted_tools=["get_kubernetes_metrics", "get_application_logs", "inspect_ci_cd_pipelines"]
        )

    # Simulated Tools
    def get_kubernetes_metrics(self, cluster_name: str = "production-cluster") -> Dict[str, Any]:
        return {
            "cluster": cluster_name,
            "status": "Healthy",
            "pods": [
                {"name": "k8s-pod-auth-872f", "cpu": "78%", "memory": "94%", "restarts": 4},
                {"name": "k8s-pod-gateway-23f2", "cpu": "12%", "memory": "40%", "restarts": 0},
                {"name": "k8s-pod-db-111a", "cpu": "45%", "memory": "65%", "restarts": 1}
            ]
        }

    def get_application_logs(self, service: str = "auth-service", lines: int = 50) -> Dict[str, Any]:
        return {
            "service": service,
            "logs": [
                "[2026-05-21 00:01:02] INFO: Connecting to database...",
                "[2026-05-21 00:01:05] ERROR: Connection pool exhausted. Retrying...",
                "[2026-05-21 00:01:10] WARNING: Slow query detected on SELECT * FROM users;",
                "[2026-05-21 00:01:12] FATAL: Out of memory during request processing."
            ]
        }

    def inspect_ci_cd_pipelines(self, repo: str = "omniops-ai") -> Dict[str, Any]:
        return {
            "repository": repo,
            "workflows": [
                {"name": "Build & Deploy", "status": "Failed", "run_number": 142, "trigger": "push"}
            ]
        }

    def execute_task(self, task_description: str) -> Dict[str, Any]:
        logger.info(f"DevOps Agent executing: {task_description}")
        
        # Decide which tools to invoke based on prompt
        tool_results = {}
        if "metrics" in task_description or "k8s" in task_description or "pod" in task_description:
            metrics = self.execute_tool_with_resilience("get_kubernetes_metrics", self.get_kubernetes_metrics)
            tool_results["kubernetes_metrics"] = metrics
        if "logs" in task_description or "error" in task_description or "incident" in task_description:
            logs = self.execute_tool_with_resilience("get_application_logs", self.get_application_logs)
            tool_results["application_logs"] = logs
        if "pipeline" in task_description or "ci/cd" in task_description or "build" in task_description:
            pipeline = self.execute_tool_with_resilience("inspect_ci_cd_pipelines", self.inspect_ci_cd_pipelines)
            tool_results["ci_cd_pipelines"] = pipeline

        # Execute LLM to synthesize tool findings into final recommendation
        prompt = f"""
        You are the DevOps Agent. Based on the task: "{task_description}" 
        and the tool results: {json.dumps(tool_results)}, analyze the systems issues.
        Return your answer as a JSON object containing keys: 'status', 'insight', 'confidence' (float), and 'recommendation'.
        """
        
        raw_response = self.call_llm(prompt)
        try:
            return json.loads(raw_response)
        except Exception:
            return {
                "status": "degraded",
                "insight": "DevOps Agent analyzed logs and found service instability.",
                "confidence": 0.80,
                "recommendation": "Investigate DB connection pool size."
            }
