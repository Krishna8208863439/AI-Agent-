"""
Autonomous Workflow Scheduler — detects patterns and schedules recurring workflows.
"""
import asyncio, datetime, logging, uuid
from typing import List, Dict, Any, Callable

logger = logging.getLogger("scheduler")

class ScheduledJob:
    def __init__(self, job_id: str, name: str, prompt: str,
                 cron_expr: str, user_id: str, auto_approve: bool = False):
        self.job_id = job_id
        self.name = name
        self.prompt = prompt
        self.cron_expr = cron_expr
        self.user_id = user_id
        self.auto_approve = auto_approve
        self.last_run: str | None = None
        self.run_count = 0
        self.enabled = True
        self.created_at = datetime.datetime.utcnow().isoformat()

    def to_dict(self) -> Dict:
        return {
            "job_id": self.job_id, "name": self.name, "prompt": self.prompt,
            "cron_expr": self.cron_expr, "user_id": self.user_id,
            "auto_approve": self.auto_approve, "last_run": self.last_run,
            "run_count": self.run_count, "enabled": self.enabled,
            "created_at": self.created_at
        }

class WorkflowScheduler:
    def __init__(self):
        self.jobs: Dict[str, ScheduledJob] = {}
        self._executor: Callable | None = None
        self._running = False

    def set_executor(self, fn: Callable):
        self._executor = fn

    def add_job(self, name: str, prompt: str, cron_expr: str,
                user_id: str, auto_approve: bool = False) -> str:
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = ScheduledJob(job_id, name, prompt, cron_expr, user_id, auto_approve)
        logger.info(f"Scheduled job added: {name} [{cron_expr}]")
        return job_id

    def remove_job(self, job_id: str) -> bool:
        if job_id in self.jobs:
            del self.jobs[job_id]
            return True
        return False

    def toggle_job(self, job_id: str) -> bool:
        if job_id in self.jobs:
            self.jobs[job_id].enabled = not self.jobs[job_id].enabled
            return self.jobs[job_id].enabled
        return False

    def list_jobs(self) -> List[Dict]:
        return [j.to_dict() for j in self.jobs.values()]

    def _should_run(self, job: ScheduledJob) -> bool:
        """Simple interval-based check (production would use croniter)."""
        if not job.enabled:
            return False
        if job.last_run is None:
            return False  # Don't auto-run on first registration
        last = datetime.datetime.fromisoformat(job.last_run)
        now = datetime.datetime.utcnow()
        # For demo: run every 60 minutes if cron says @hourly
        if "@hourly" in job.cron_expr:
            return (now - last).total_seconds() >= 3600
        if "@daily" in job.cron_expr:
            return (now - last).total_seconds() >= 86400
        return False

    async def tick(self):
        """Called periodically to check and fire due jobs."""
        for job in list(self.jobs.values()):
            if self._should_run(job) and self._executor:
                logger.info(f"Firing scheduled job: {job.name}")
                job.last_run = datetime.datetime.utcnow().isoformat()
                job.run_count += 1
                try:
                    await self._executor(job.prompt, job.user_id)
                except Exception as e:
                    logger.error(f"Scheduled job {job.name} failed: {e}")

scheduler = WorkflowScheduler()
