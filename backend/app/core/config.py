from typing import List, Optional

from pydantic import model_validator
from pydantic_settings import BaseSettings

_DEV_SECRET_KEY = "SUPER_SECRET_KEY_FOR_DEV_ONLY_12345"


class Settings(BaseSettings):
    PROJECT_NAME: str = "VeriSonic"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = "development"  # development | production
    SECRET_KEY: str = _DEV_SECRET_KEY
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REQUIRE_REDIS: bool = False
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

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

    # Razorpay (INR subscriptions)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = True

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            self.REQUIRE_REDIS = True
            if self.SECRET_KEY == _DEV_SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "Production requires SECRET_KEY to be set (32+ characters) via environment variable."
                )
        return self

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
