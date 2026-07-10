"""Tracked schema migrations (replaces ad-hoc ALTER TABLE on every startup)."""

from sqlalchemy import text
from sqlalchemy.orm import Session


MIGRATIONS = [
    ("001_tracks_metadata_cols", """
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS cover_image_path VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics TEXT;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS composer VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyricist VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS year INTEGER;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artist_name_override VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS language VARCHAR;
    """),
    ("002_radio_stations_core_cols", """
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS stream_url VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS owner_id INTEGER;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS stream_key VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS current_program_title VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS rj_name VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS rj_details VARCHAR;
    """),
    ("003_radio_stations_profile_cols", """
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS category VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS licence VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS street_address VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS city VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS state_province VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS postal_code VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS country VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS phone VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS email VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS website VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS broadcast_frequency VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS languages VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS social_twitter VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS social_instagram VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS programs_list VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS timezone VARCHAR;
    """),
    ("004_artists_moderation_cols", """
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS disabled_reason VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS reactivation_reason VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS reactivation_requested BOOLEAN DEFAULT FALSE;
    """),
    ("005_radio_stations_moderation_cols", """
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS disabled_reason VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS reactivation_reason VARCHAR;
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS reactivation_requested BOOLEAN DEFAULT FALSE;
    """),
    ("006_users_subscription_cols", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription VARCHAR DEFAULT 'free';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cycle VARCHAR;
    """),
]


def _ensure_migration_table(db: Session) -> None:
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id VARCHAR(128) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """))
    db.commit()


def run_migrations(db: Session) -> None:
    _ensure_migration_table(db)
    applied = {
        row[0]
        for row in db.execute(text("SELECT id FROM schema_migrations")).fetchall()
    }
    for migration_id, sql in MIGRATIONS:
        if migration_id in applied:
            continue
        for statement in sql.strip().split(";"):
            stmt = statement.strip()
            if stmt:
                db.execute(text(stmt))
        db.execute(
            text("INSERT INTO schema_migrations (id) VALUES (:id)"),
            {"id": migration_id},
        )
        db.commit()
        print(f"Applied migration: {migration_id}")
