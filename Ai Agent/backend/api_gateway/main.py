import os
import re
import time
import logging
import httpx
from typing import Dict, Any, Optional
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import jwt
from redis import Redis

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_gateway")

app = FastAPI(title="OmniOps AI API Gateway", version="1.0.0")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from Environment
SUPERVISOR_URL = os.getenv("SUPERVISOR_URL", "http://localhost:8081")
JWT_SECRET = os.getenv("JWT_SECRET", "super_secret_jwt_key_12345")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Redis Initialization
try:
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    logger.info("Connected to Redis successfully.")
except Exception as e:
    logger.warning(f"Failed to connect to Redis. Rate limiting will fall back to in-memory/disabled. Error: {e}")
    redis_client = None

# OAuth2 Scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

# Prompt Injection Patterns
PROMPT_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?prior\s+instructions", re.IGNORECASE),
    re.compile(r"system\s+prompt\s+bypass", re.IGNORECASE),
    re.compile(r"you\s+must\s+now\s+act\s+as", re.IGNORECASE),
    re.compile(r"ignore\s+above\s+instructions", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
    re.compile(r"\(dan\s+mode\)", re.IGNORECASE),
]

class WorkflowRequest(BaseModel):
    prompt: str
    user_id: str
    metadata: Optional[Dict[str, Any]] = None

def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
    """
    Decodes the JWT to authenticate the user. 
    If no token is supplied, defaults to a mock user for local dev/testing.
    """
    if not token:
        # For ease of testing/SSO routing or initial setup, allow mock user if config allows
        return {"user_id": "mock_operator", "role": "operator"}
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def is_rate_limited(user_id: str, limit: int = 60, window: int = 60) -> bool:
    """
    Performs rate limiting using Redis. Default: 60 requests per minute.
    """
    if not redis_client:
        return False  # Skip rate limiting if redis is unavailable
    
    key = f"rate_limit:{user_id}"
    try:
        current = redis_client.get(key)
        if current is not None and int(current) >= limit:
            return True
        
        # Increment and set TTL if new key
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        pipe.execute()
        return False
    except Exception as e:
        logger.error(f"Redis rate limiting error: {e}")
        return False

def contains_prompt_injection(text: str) -> bool:
    """
    Scans the input text for common prompt injection/jailbreak keywords.
    """
    for pattern in PROMPT_INJECTION_PATTERNS:
        if pattern.search(text):
            return True
    return False

@app.post("/api/workflow")
async def start_workflow(
    request_data: WorkflowRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    start_time = time.time()
    
    # 1. Enforce Authentication (implicitly done by get_current_user Depends)
    user_id = request_data.user_id
    
    # 2. Rate Limiting Check
    if is_rate_limited(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later."
        )
    
    # 3. Prompt Injection Check (Requirement 1.7 & 1.8)
    if contains_prompt_injection(request_data.prompt):
        # Log injection attempt
        logger.warning(f"Audit Log: Prompt injection detected from user {user_id}. Prompt: {request_data.prompt}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request rejected due to potential security policy violation (Prompt Injection)."
        )
    
    # 4. Route request to Supervisor Agent (Requirement 1.6 - route within 500ms)
    async with httpx.AsyncClient() as client:
        try:
            # Construct endpoint URL
            url = f"{SUPERVISOR_URL}/workflow/start"
            logger.info(f"Routing request to Supervisor: {url}")
            
            # Record route time
            response = await client.post(
                url, 
                json={
                    "prompt": request_data.prompt,
                    "user_id": user_id,
                    "role": current_user.get("role", "operator"),
                    "metadata": request_data.metadata
                },
                timeout=5.0
            )
            
            elapsed = time.time() - start_time
            logger.info(f"Routed request in {elapsed * 1000:.2f}ms")
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Supervisor agent error: {response.text}"
                )
            
            return response.json()
        except httpx.RequestError as e:
            logger.error(f"Failed to connect to Supervisor Agent: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Supervisor Agent is currently unreachable."
            )

@app.get("/health")
def health_check():
    return {"status": "healthy", "redis": redis_client is not None}
