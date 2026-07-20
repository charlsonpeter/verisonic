from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "tasks",
    broker=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0",
    backend=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/0"
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "daily-revenue-settlement": {
            "task": "app.tasks.tasks.settle_daily_revenue_task",
            "schedule": crontab(hour=0, minute=30),
        },
    },
)

# Autodiscover tasks from the app/tasks directory
celery_app.autodiscover_tasks(["app.tasks"])
