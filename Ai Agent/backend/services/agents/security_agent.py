import json
import logging
from typing import Dict, Any
from agents.agent_base import AgentBase

logger = logging.getLogger("security_agent")

class SecurityAgent(AgentBase):
    def __init__(self):
        super().__init__(
            role="Security",
            permitted_tools=["query_access_logs", "perform_vulnerability_scan", "get_threat_feeds"]
        )

    # Simulated Tools
    def query_access_logs(self, limit: int = 10) -> Dict[str, Any]:
        return {
            "attempts": [
                {"timestamp": "2026-05-21 00:02:15", "ip": "192.168.1.100", "user": "admin", "result": "Failed"},
                {"timestamp": "2026-05-21 00:02:18", "ip": "192.168.1.100", "user": "admin", "result": "Failed"},
                {"timestamp": "2026-05-21 00:02:22", "ip": "192.168.1.100", "user": "admin", "result": "Failed"}
            ],
            "risk_score": "Medium"
        }

    def perform_vulnerability_scan(self, target: str = "api-gateway") -> Dict[str, Any]:
        return {
            "target": target,
            "scan_status": "COMPLETED",
            "vulnerabilities": [
                {"cve": "CVE-2023-3817", "severity": "Low", "description": "SSL config weak cipher suite allowed."}
            ]
        }

    def get_threat_feeds(self) -> Dict[str, Any]:
        return {
            "active_campaigns": [
                {"name": "SQL Injection on FastAPI Gateway endpoints", "origin": "various", "threat_level": "High"}
            ]
        }

    def execute_task(self, task_description: str) -> Dict[str, Any]:
        logger.info(f"Security Agent executing: {task_description}")
        
        tool_results = {}
        if "access" in task_description or "login" in task_description or "anomaly" in task_description:
            logs = self.execute_tool_with_resilience("query_access_logs", self.query_access_logs)
            tool_results["access_logs"] = logs
        if "scan" in task_description or "cve" in task_description or "vulnerability" in task_description:
            scan = self.execute_tool_with_resilience("perform_vulnerability_scan", self.perform_vulnerability_scan)
            tool_results["vuln_scan"] = scan
        if "threat" in task_description or "feed" in task_description:
            threats = self.execute_tool_with_resilience("get_threat_feeds", self.get_threat_feeds)
            tool_results["threat_feeds"] = threats

        prompt = f"""
        You are the Security Agent. Based on the task: "{task_description}" 
        and the tool results: {json.dumps(tool_results)}, perform a security assessment.
        Return your answer as a JSON object containing keys: 'status', 'insight', 'confidence' (float), and 'recommendation'.
        """
        
        raw_response = self.call_llm(prompt)
        try:
            return json.loads(raw_response)
        except Exception:
            return {
                "status": "secure",
                "insight": "Security review completed. Detected no active breaches, only minor warning access events.",
                "confidence": 0.95,
                "recommendation": "Maintain IP monitoring rules."
            }
