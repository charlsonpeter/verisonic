from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

# Import DB and Routers
from app.db.session import engine, SessionLocal
from app.db.base_class import Base
from app.models import User, Genre
from app.core.security import get_password_hash
from app.api import auth, music, radio, playlists, analytics

# Ensure all database tables exist on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Setup database seeder and verify storage bucket policy on application startup
@app.on_event("startup")
def startup_seeder():
    from app.services.storage import ensure_bucket_exists
    ensure_bucket_exists()
    
    db = SessionLocal()
    try:
        # SQL migration for new track columns
        from sqlalchemy import text
        columns_to_add = [
            ("cover_image_path", "VARCHAR"),
            ("lyrics", "TEXT"),
            ("composer", "VARCHAR"),
            ("lyricist", "VARCHAR"),
            ("year", "INTEGER"),
            ("artist_name_override", "VARCHAR"),
            ("language", "VARCHAR")
        ]
        for col_name, col_type in columns_to_add:
            try:
                db.execute(text(f"ALTER TABLE tracks ADD COLUMN {col_name} {col_type};"))
                db.commit()
                print(f"Migration: Added column {col_name} successfully.")
            except Exception:
                db.rollback()

        # SQL migration for radio_stations stream_url column
        try:
            db.execute(text("ALTER TABLE radio_stations ADD COLUMN stream_url VARCHAR;"))
            db.commit()
            print("Migration: Added column stream_url to radio_stations successfully.")
        except Exception:
            db.rollback()

        # SQL migration for radio_stations owner_id column
        try:
            db.execute(text("ALTER TABLE radio_stations ADD COLUMN owner_id INTEGER;"))
            db.commit()
            print("Migration: Added column owner_id to radio_stations successfully.")
        except Exception:
            db.rollback()

        # SQL migration for radio_stations stream_key column
        try:
            db.execute(text("ALTER TABLE radio_stations ADD COLUMN stream_key VARCHAR;"))
            db.commit()
            print("Migration: Added column stream_key to radio_stations successfully.")
        except Exception:
            db.rollback()

        # SQL migration for radio_stations current_program_title column
        try:
            db.execute(text("ALTER TABLE radio_stations ADD COLUMN current_program_title VARCHAR;"))
            db.commit()
            print("Migration: Added column current_program_title to radio_stations successfully.")
        except Exception:
            db.rollback()

        # SQL migration for radio_stations rj_name column
        try:
            db.execute(text("ALTER TABLE radio_stations ADD COLUMN rj_name VARCHAR;"))
            db.commit()
            print("Migration: Added column rj_name to radio_stations successfully.")
        except Exception:
            db.rollback()

        # SQL migration for radio_stations rj_details column
        try:
            db.execute(text("ALTER TABLE radio_stations ADD COLUMN rj_details VARCHAR;"))
            db.commit()
            print("Migration: Added column rj_details to radio_stations successfully.")
        except Exception:
            db.rollback()

        new_cols = [
            "category", "licence", "street_address", "city", 
            "state_province", "postal_code", "country", "phone", 
            "email", "website", "broadcast_frequency", "languages", 
            "social_twitter", "social_instagram", "programs_list", "timezone"
        ]
        for col in new_cols:
            try:
                db.execute(text(f"ALTER TABLE radio_stations ADD COLUMN {col} VARCHAR;"))
                db.commit()
                print(f"Migration: Added column {col} to radio_stations successfully.")
            except Exception:
                db.rollback()

        # SQL migration for artists is_active column
        try:
            db.execute(text("ALTER TABLE artists ADD COLUMN is_active BOOLEAN DEFAULT TRUE;"))
            db.commit()
            print("Migration: Added column is_active to artists successfully.")
        except Exception:
            db.rollback()

        # SQL migration for radio_stations and artists new columns
        for table in ["radio_stations", "artists"]:
            for col, col_type in [("disabled_reason", "VARCHAR"), ("reactivation_reason", "VARCHAR"), ("reactivation_requested", "BOOLEAN DEFAULT FALSE")]:
                try:
                    db.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type};"))
                    db.commit()
                    print(f"Migration: Added column {col} to {table} successfully.")
                except Exception:
                    db.rollback()

        # SQL migration for users subscription column
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN subscription VARCHAR DEFAULT 'free';"))
            db.commit()
            print("Migration: Added column subscription to users successfully.")
        except Exception:
            db.rollback()

        # SQL migration for users subscription_cycle column
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN subscription_cycle VARCHAR;"))
            db.commit()
            print("Migration: Added column subscription_cycle to users successfully.")
        except Exception:
            db.rollback()

        # 1. Seed Admin account if empty
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
            
        # 2. Seed Default Genres if empty
        genre_count = db.query(Genre).count()
        if genre_count == 0:
            genres = ["Rock", "Electronic", "Classical", "Jazz", "Hip-Hop", "Ambient"]
            for g_name in genres:
                db.add(Genre(name=g_name))
            db.commit()
            print("Seeded default genres")
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()

# Set CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(music.router, prefix="/api")
app.include_router(playlists.router, prefix="/api")
app.include_router(radio.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": f"Welcome to {settings.PROJECT_NAME} API"}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

