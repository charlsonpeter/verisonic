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
    ("007_favorites_playlists_user_unique", """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_track ON favorites (user_id, track_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_playlist_tracks_playlist_track ON playlist_tracks (playlist_id, track_id);
    """),
    ("008_users_must_reset_password", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN DEFAULT FALSE;
    """),
    ("009_subscription_payments", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP;
        CREATE TABLE IF NOT EXISTS subscription_payments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            plan_id VARCHAR NOT NULL,
            amount_paise INTEGER NOT NULL,
            currency VARCHAR NOT NULL DEFAULT 'INR',
            razorpay_order_id VARCHAR NOT NULL UNIQUE,
            razorpay_payment_id VARCHAR UNIQUE,
            status VARCHAR NOT NULL DEFAULT 'created',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            paid_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_subscription_payments_user_id ON subscription_payments (user_id);
        CREATE INDEX IF NOT EXISTS ix_subscription_payments_razorpay_order_id ON subscription_payments (razorpay_order_id);
    """),
    ("010_users_stream_quality", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS stream_quality VARCHAR;
    """),
    ("011_users_subscription_queue", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_plan_id VARCHAR;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_plan_paid BOOLEAN DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT FALSE;
    """),
    ("012_users_subscription_activated_at", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_activated_at TIMESTAMP;
    """),
    ("013_artists_profile_cols", """
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT FALSE;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS category VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS licence VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS street_address VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS city VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS state_province VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS postal_code VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS country VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS phone VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS email VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS website VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS languages VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_twitter VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS social_instagram VARCHAR;
        UPDATE artists SET profile_complete = TRUE WHERE bio IS NOT NULL AND TRIM(bio) != '';
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
