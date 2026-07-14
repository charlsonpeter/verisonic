import asyncio
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from app.core.security_headers import SecurityHeadersMiddleware
from app.core.config import settings

from app.db.session import engine, SessionLocal
from app.db.base_class import Base
from app.db.migrations import run_migrations
from app.models import User, Genre
from app.core.security import get_password_hash, verify_password
from app.api import auth, music, radio, playlists, analytics, favorites, subscriptions, wallet, revenue_admin, discovery, catalog
from app.services.live_stream import live_stream_manager
from app.services.subscription_service import apply_admin_subscription

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=None if settings.is_production else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)


def _wait_for_database(max_attempts: int = 30, delay_seconds: float = 2.0) -> None:
    """Wait until Postgres is reachable (Docker cold starts)."""
    for attempt in range(max_attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError:
            if attempt + 1 >= max_attempts:
                raise
            print(f"Database not ready (attempt {attempt + 1}/{max_attempts}), retrying...")
            time.sleep(delay_seconds)


@app.on_event("startup")
async def startup_seeder():
    from app.services.storage import ensure_bucket_exists
    ensure_bucket_exists()

    live_stream_manager.bind_event_loop(asyncio.get_running_loop())

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _wait_for_database)
    await loop.run_in_executor(None, lambda: Base.metadata.create_all(bind=engine))

    db = SessionLocal()
    try:
        run_migrations(db)

        admin_users = db.query(User).filter(User.role == "admin").all()
        if not admin_users:
            admin = User(
                email="admin@verisonic.com",
                hashed_password=get_password_hash("admin12345"),
                full_name="Platform Administrator",
                role="admin",
                must_reset_password=True,
            )
            db.add(admin)
            db.flush()
            apply_admin_subscription(admin, "unlimited", None, db)
            db.commit()
            print("Seeded default admin account (admin@verisonic.com / admin12345)")
        else:
            dirty = False
            for admin_user in admin_users:
                if admin_user.subscription != "unlimited":
                    apply_admin_subscription(admin_user, "unlimited", None, db)
                    dirty = True
                if (
                    admin_user.email == "admin@verisonic.com"
                    and verify_password("admin12345", admin_user.hashed_password)
                    and not admin_user.must_reset_password
                ):
                    admin_user.must_reset_password = True
                    dirty = True
            if dirty:
                db.commit()
                print("Synced platform admin accounts (unlimited subscription / password reset flags)")

        genre_count = db.query(Genre).count()
        if genre_count == 0:
            for g_name in ["Rock", "Electronic", "Classical", "Jazz", "Hip-Hop", "Ambient"]:
                db.add(Genre(name=g_name))
            db.commit()
            print("Seeded default genres")

        # Backfill four-tier HLS for approved tracks missing quality playlists
        try:
            from app.tasks.tasks import queue_missing_hls_retranscodes_task
            queue_missing_hls_retranscodes_task.delay()
        except Exception as retranscode_err:
            print(f"Could not queue HLS re-transcode backfill: {retranscode_err}")
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Range"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(music.router, prefix="/api")
app.include_router(playlists.router, prefix="/api")
app.include_router(favorites.router, prefix="/api")
app.include_router(radio.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(wallet.router, prefix="/api")
app.include_router(revenue_admin.router, prefix="/api")
app.include_router(discovery.router, prefix="/api")
app.include_router(catalog.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
