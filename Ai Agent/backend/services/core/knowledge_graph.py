"""
Knowledge Graph — entity-relationship store for causal reasoning.
"""
import datetime, logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger("knowledge_graph")

class KGNode:
    def __init__(self, node_id: str, node_type: str, label: str, properties: Dict = None):
        self.node_id = node_id
        self.node_type = node_type  # incident, service, agent, action, metric
        self.label = label
        self.properties = properties or {}
        self.created_at = datetime.datetime.utcnow().isoformat()

class KGEdge:
    def __init__(self, from_id: str, to_id: str, relation: str, weight: float = 1.0):
        self.from_id = from_id
        self.to_id = to_id
        self.relation = relation  # caused_by, related_to, fixed_by, affects, triggers
        self.weight = weight
        self.created_at = datetime.datetime.utcnow().isoformat()

class KnowledgeGraph:
    def __init__(self):
        self.nodes: Dict[str, KGNode] = {}
        self.edges: List[KGEdge] = []
        self._seed_demo()

    def add_node(self, node_id: str, node_type: str, label: str, properties: Dict = None) -> KGNode:
        node = KGNode(node_id, node_type, label, properties)
        self.nodes[node_id] = node
        return node

    def add_edge(self, from_id: str, to_id: str, relation: str, weight: float = 1.0):
        self.edges.append(KGEdge(from_id, to_id, relation, weight))

    def query_causes(self, node_id: str) -> List[Dict]:
        causes = []
        for edge in self.edges:
            if edge.to_id == node_id and edge.relation in ("caused_by", "triggers"):
                src = self.nodes.get(edge.from_id)
                if src:
                    causes.append({"node": src.__dict__, "relation": edge.relation, "weight": edge.weight})
        return causes

    def query_fixes(self, node_id: str) -> List[Dict]:
        fixes = []
        for edge in self.edges:
            if edge.from_id == node_id and edge.relation == "fixed_by":
                tgt = self.nodes.get(edge.to_id)
                if tgt:
                    fixes.append({"node": tgt.__dict__, "relation": edge.relation})
        return fixes

    def search(self, query: str) -> List[Dict]:
        q = query.lower()
        results = []
        for node in self.nodes.values():
            if q in node.label.lower() or q in node.node_type.lower():
                results.append({
                    "node_id": node.node_id, "type": node.node_type,
                    "label": node.label, "properties": node.properties
                })
        return results[:10]

    def to_graph_data(self) -> Dict:
        return {
            "nodes": [{"id": n.node_id, "type": n.node_type, "label": n.label,
                       "properties": n.properties} for n in self.nodes.values()],
            "edges": [{"from": e.from_id, "to": e.to_id, "relation": e.relation,
                       "weight": e.weight} for e in self.edges]
        }

    def _seed_demo(self):
        self.add_node("inc-001", "incident", "Auth Service OOM Crash", {"severity": "P1", "date": "2026-05-20"})
        self.add_node("svc-auth", "service", "auth-service", {"team": "platform"})
        self.add_node("metric-mem", "metric", "pod_memory_pct > 94%", {"value": 94})
        self.add_node("action-restart", "action", "Pod Restart", {"duration": "8s"})
        self.add_node("action-memlimit", "action", "Increase Memory Limit to 512Mi", {})
        self.add_node("inc-002", "incident", "DB Connection Pool Exhaustion", {"severity": "P2"})
        self.add_node("svc-db", "service", "postgresql-primary", {"team": "data"})
        self.add_node("action-pool", "action", "Increase pool_size to 50", {})
        self.add_node("kb-001", "knowledge", "Runbook: OOM Recovery", {"source": "internal_kb"})

        self.add_edge("metric-mem", "inc-001", "caused_by", 0.95)
        self.add_edge("inc-001", "svc-auth", "affects", 1.0)
        self.add_edge("inc-001", "action-restart", "fixed_by", 0.9)
        self.add_edge("inc-001", "action-memlimit", "fixed_by", 0.85)
        self.add_edge("inc-001", "kb-001", "related_to", 0.8)
        self.add_edge("inc-002", "svc-db", "affects", 1.0)
        self.add_edge("inc-002", "action-pool", "fixed_by", 0.92)
        self.add_edge("inc-001", "inc-002", "triggers", 0.6)

knowledge_graph = KnowledgeGraph()
