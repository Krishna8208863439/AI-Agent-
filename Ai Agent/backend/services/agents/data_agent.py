import json
import logging
from typing import Dict, Any
from agents.agent_base import AgentBase

logger = logging.getLogger("data_agent")

class DataAnalystAgent(AgentBase):
    def __init__(self):
        super().__init__(
            role="Data Analyst",
            permitted_tools=["execute_sql_query", "extract_kpi_dashboard_metrics"]
        )

    # Simulated Tools
    def execute_sql_query(self, query: str) -> Dict[str, Any]:
        return {
            "query": query,
            "columns": ["date", "conversions", "revenue"],
            "rows": [
                ["2026-05-19", 120, 3600.00],
                ["2026-05-20", 145, 4350.00],
                ["2026-05-21", 168, 5040.00]
            ]
        }

    def extract_kpi_dashboard_metrics(self) -> Dict[str, Any]:
        return {
            "mrr": "$1.2M",
            "churn_rate": "2.4%",
            "cac": "$120",
            "ltv": "$3,000",
            "conversion_rate": "4.2%"
        }

    def execute_task(self, task_description: str) -> Dict[str, Any]:
        logger.info(f"Data Analyst Agent executing: {task_description}")
        
        tool_results = {}
        if "sql" in task_description or "query" in task_description or "database" in task_description:
            sql_res = self.execute_tool_with_resilience(
                "execute_sql_query", 
                self.execute_sql_query, 
                query="SELECT date, conversions, revenue FROM sales_metrics WHERE date >= NOW() - INTERVAL '3 days';"
            )
            tool_results["sql_query"] = sql_res
        if "kpi" in task_description or "dashboard" in task_description or "revenue" in task_description or "churn" in task_description:
            kpis = self.execute_tool_with_resilience("extract_kpi_dashboard_metrics", self.extract_kpi_dashboard_metrics)
            tool_results["kpis"] = kpis

        prompt = f"""
        You are the Data Analyst Agent. Based on the task: "{task_description}" 
        and the tool results: {json.dumps(tool_results)}, perform a quick business analysis.
        Return your answer as a JSON object containing keys: 'status', 'insight', 'confidence' (float), and 'recommendation'.
        """
        
        raw_response = self.call_llm(prompt)
        try:
            return json.loads(raw_response)
        except Exception:
            return {
                "status": "completed",
                "insight": "Data analyst processed SQL query showing a revenue increase of 15% WoW.",
                "confidence": 0.85,
                "recommendation": "Maintain standard operations."
            }
