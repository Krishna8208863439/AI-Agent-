import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from db.database import Base

class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, index=True)
    prompt = Column(String, nullable=False)
    user_id = Column(String, nullable=False)
    status = Column(String, default="PENDING")  # PENDING, RUNNING, COMPLETED, DEGRADED, FAILED, SUSPENDED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    
    subtasks = relationship("SubTask", back_populates="workflow", cascade="all, delete-orphan")
    checkpoints = relationship("ApprovalCheckpoint", back_populates="workflow", cascade="all, delete-orphan")

class SubTask(Base):
    __tablename__ = "subtasks"

    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    agent_domain = Column(String, nullable=False)  # DevOps, Data, Research, Support, Security
    status = Column(String, default="PENDING")  # PENDING, RUNNING, COMPLETED, FAILED, SKIPPED
    result = Column(JSON, nullable=True)
    confidence = Column(Float, default=0.0)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    workflow = relationship("Workflow", back_populates="subtasks")

class ApprovalCheckpoint(Base):
    __tablename__ = "approval_checkpoints"

    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflows.id"), nullable=False)
    subtask_id = Column(String, nullable=True)
    action_type = Column(String, nullable=False)  # DB_WRITE, EXTERNAL_COMM, DEPLOYMENT, FINANCIAL, SECURITY_REMEDIATION
    description = Column(String, nullable=False)
    status = Column(String, default="PENDING")  # PENDING, APPROVED, REJECTED
    assigned_role = Column(String, default="operator")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    workflow = relationship("Workflow", back_populates="checkpoints")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    actor = Column(String, nullable=False)  # User or Agent ID
    action_type = Column(String, nullable=False)  # TOOL_CALL, APPROVAL, WORKFLOW_INIT, etc.
    details = Column(JSON, nullable=True)
    outcome = Column(String, nullable=False)  # SUCCESS, FAILURE, DENIED
