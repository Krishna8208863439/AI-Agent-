"""
Predictive Incident Prevention — time-series anomaly detection.
"""
import datetime, logging, random
from typing import List, Dict, Any

logger = logging.getLogger("predictive")

class MetricSample:
    def __init__(self, metric: str, value: float, timestamp: str):
        self.metric = metric
        self.value = value
        self.timestamp = timestamp

class PredictiveEngine:
    def __init__(self):
        self.metric_history: Dict[str, List[MetricSample]] = {}
        self.alerts: List[Dict] = []
        self.thresholds = {
            "pod_memory_pct":   {"warn": 80.0, "critical": 90.0},
            "error_rate_pct":   {"warn": 5.0,  "critical": 15.0},
            "cpu_pct":          {"warn": 75.0, "critical": 90.0},
            "latency_p95_ms":   {"warn": 20000, "critical": 28000},
            "cost_daily_usd":   {"warn": 500.0, "critical": 800.0},
        }

    def ingest(self, metric: str, value: float):
        if metric not in self.metric_history:
            self.metric_history[metric] = []
        self.metric_history[metric].append(
            MetricSample(metric, value, datetime.datetime.utcnow().isoformat())
        )
        # Keep last 100 samples
        self.metric_history[metric] = self.metric_history[metric][-100:]
        self._check_threshold(metric, value)

    def _check_threshold(self, metric: str, value: float):
        if metric not in self.thresholds:
            return
        t = self.thresholds[metric]
        level = None
        if value >= t["critical"]:
            level = "CRITICAL"
        elif value >= t["warn"]:
            level = "WARNING"
        if level:
            alert = {
                "id": f"alert-{len(self.alerts)+1}",
                "metric": metric, "value": value,
                "level": level, "threshold": t["critical"] if level == "CRITICAL" else t["warn"],
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "prediction": self._predict_trend(metric),
                "recommendation": self._get_recommendation(metric, level)
            }
            self.alerts.append(alert)
            logger.warning(f"Predictive alert: {metric}={value} [{level}]")

    def _predict_trend(self, metric: str) -> str:
        history = self.metric_history.get(metric, [])
        if len(history) < 3:
            return "insufficient_data"
        recent = [s.value for s in history[-5:]]
        avg_delta = (recent[-1] - recent[0]) / len(recent)
        if avg_delta > 2:
            return "rising_fast"
        elif avg_delta > 0.5:
            return "rising"
        elif avg_delta < -2:
            return "falling_fast"
        elif avg_delta < -0.5:
            return "falling"
        return "stable"

    def _get_recommendation(self, metric: str, level: str) -> str:
        recs = {
            "pod_memory_pct": "Consider pod restart or increasing memory limits",
            "error_rate_pct": "Investigate recent deployments and DB connection pool",
            "cpu_pct": "Scale horizontally or optimize hot code paths",
            "latency_p95_ms": "Check downstream dependencies and cache hit rates",
            "cost_daily_usd": "Review resource utilization and reserved instance coverage",
        }
        return recs.get(metric, "Investigate metric anomaly")

    def get_current_metrics(self) -> Dict[str, Any]:
        result = {}
        for metric, samples in self.metric_history.items():
            if samples:
                result[metric] = {
                    "current": samples[-1].value,
                    "trend": self._predict_trend(metric),
                    "sample_count": len(samples)
                }
        return result

    def get_alerts(self, limit: int = 20) -> List[Dict]:
        return self.alerts[-limit:]

    def seed_demo_data(self):
        """Seed realistic demo metrics."""
        import random
        base = {"pod_memory_pct": 72, "error_rate_pct": 2.1, "cpu_pct": 45,
                "latency_p95_ms": 8500, "cost_daily_usd": 320}
        for metric, start in base.items():
            for i in range(20):
                noise = random.uniform(-3, 5)
                self.ingest(metric, max(0, start + i * 0.8 + noise))

predictive_engine = PredictiveEngine()
predictive_engine.seed_demo_data()
