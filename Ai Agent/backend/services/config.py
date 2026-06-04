import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", 8000))
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    DB_URL: str = os.getenv("DB_URL", "postgresql://omniops:omniops_password@localhost:5432/omniops_db")
    
    # LLM Settings
    DEFAULT_LLM_PROVIDER: str = os.getenv("DEFAULT_LLM_PROVIDER", "mock")  # openai, anthropic, ollama, mock
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    
    # Alert configurations
    P95_LATENCY_ALERT_THRESHOLD_SEC: float = 30.0

settings = Settings()
