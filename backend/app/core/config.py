from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "VeriSonic"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = "SUPER_SECRET_KEY_FOR_DEV_ONLY_12345"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080 # 7 days
    
    # DB
    POSTGRES_SERVER: str = "db"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "verisonic"
    
    # Redis
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    
    # AWS / MinIO
    AWS_ACCESS_KEY_ID: str = "minioadmin"
    AWS_SECRET_ACCESS_KEY: str = "minioadmin"
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "verisonic-audio"
    S3_ENDPOINT_URL: Optional[str] = "http://minio:9000"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
