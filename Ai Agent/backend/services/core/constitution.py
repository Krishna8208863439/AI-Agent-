"""
Constitutional AI Policy Engine — evaluates every agent action against policy rules.
"""
import re, logging
from typing import Dict, Any, List, Tuple

logger = logging.getLogger("constitution")

class PolicyRule:
    def __init__(self, rule_id: str, description: str, severity: str, check_fn):
        self.rule_id = rule_id
        self.description = description
        self.severity = severity  # BLOCK, WARN, INFO
        self.check_fn = check_fn

class ConstitutionEngine:
    def __init__(self):
        self.rules: List[PolicyRule] = []
        self.violations: List[Dict] = []
        self._register_default_rules()

    def _register_default_rules(self):
        self.rules = [
            PolicyRule("C001", "Never expose raw PII in outputs", "BLOCK",
                lambda action, payload: not any(p in str(payload).lower()
                    for p in ["@gmail", "@yahoo", "ssn:", "credit_card"])),
            PolicyRule("C002", "No production DB writes without approval flag", "BLOCK",
                lambda action, payload: not (action == "postgres_write" and
                    not payload.get("approval_granted", False))),
            PolicyRule("C003", "No record deletion ever", "BLOCK",
                lambda action, payload: "delete" not in str(payload).lower() or
                    payload.get("type") != "hard_delete"),
            PolicyRule("C004", "Financial actions require manager approval", "BLOCK",
                lambda action, payload: not (action in ("financial_action", "cost_action") and
                    payload.get("approver_role") not in ("manager", "admin"))),
            PolicyRule("C005", "Security remediations require security officer", "WARN",
                lambda action, payload: not (action == "security_remediate" and
                    payload.get("approver_role") not in ("security_officer", "admin"))),
            PolicyRule("C006", "Prefer reversible actions", "INFO",
                lambda action, payload: payload.get("reversible", True)),
        ]

    def evaluate(self, action: str, payload: Dict[str, Any]) -> Tuple[bool, List[Dict]]:
        """Returns (allowed, violations_list)."""
        violations = []
        allowed = True
        for rule in self.rules:
            try:
                passed = rule.check_fn(action, payload)
                if not passed:
                    v = {"rule_id": rule.rule_id, "description": rule.description,
                         "severity": rule.severity, "action": action}
                    violations.append(v)
                    self.violations.append(v)
                    if rule.severity == "BLOCK":
                        allowed = False
                        logger.warning(f"Constitutional violation BLOCK: {rule.rule_id} on action={action}")
            except Exception as e:
                logger.error(f"Rule {rule.rule_id} evaluation error: {e}")
        return allowed, violations

    def get_violations(self, limit: int = 50) -> List[Dict]:
        return self.violations[-limit:]

    def get_stats(self) -> Dict:
        total = len(self.violations)
        by_severity = {}
        for v in self.violations:
            s = v["severity"]
            by_severity[s] = by_severity.get(s, 0) + 1
        return {"total_violations": total, "by_severity": by_severity,
                "rules_active": len(self.rules)}

constitution = ConstitutionEngine()
