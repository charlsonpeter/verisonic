import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

from app.db.session import engine, SessionLocal
from app.db.base_class import Base
from app.db.migrations import run_migrations
from app.models import User, Genre
from app.core.security import get_password_hash
from app.api import auth, music, radio, playlists, analytics, favorites
from app.services.live_stream import live_stream_manager

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)


@app.on_event("startup")
async def startup_seeder():
    from app.services.storage import ensure_bucket_exists
    ensure_bucket_exists()

    live_stream_manager.bind_event_loop(asyncio.get_running_loop())

    db = SessionLocal()
    try:
        run_migrations(db)

        admin_user = db.query(User).filter(User.role == "admin").first()
        if not admin_user:
            admin = User(
                email="admin@verisonic.com",
                hashed_password=get_password_hash("admin12345"),
                full_name="Platform Administrator",
                role="admin"
            )
            db.add(admin)
            db.commit()
            print("Seeded default admin account (admin@verisonic.com / admin12345)")

        genre_count = db.query(Genre).count()
        if genre_count == 0:
            for g_name in ["Rock", "Electronic", "Classical", "Jazz", "Hip-Hop", "Ambient"]:
                db.add(Genre(name=g_name))
            db.commit()
            print("Seeded default genres")
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(music.router, prefix="/api")
app.include_router(playlists.router, prefix="/api")
app.include_router(favorites.router, prefix="/api")
app.include_router(radio.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
