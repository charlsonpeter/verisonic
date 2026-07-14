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
    ("014_wallet_revenue", """
        CREATE TABLE IF NOT EXISTS platform_revenue_settings (
            id SERIAL PRIMARY KEY,
            premium_monthly_paise INTEGER NOT NULL DEFAULT 9900,
            premium_yearly_paise INTEGER NOT NULL DEFAULT 99900,
            company_share_bps INTEGER NOT NULL DEFAULT 3000,
            owner_share_bps INTEGER NOT NULL DEFAULT 7000,
            studio_pool_bps INTEGER NOT NULL DEFAULT 6000,
            radio_pool_bps INTEGER NOT NULL DEFAULT 4000,
            min_track_seconds INTEGER NOT NULL DEFAULT 30,
            min_radio_heartbeat_sec INTEGER NOT NULL DEFAULT 30,
            estimated_qualifying_plays_per_day INTEGER NOT NULL DEFAULT 10,
            estimated_radio_minutes_per_day INTEGER NOT NULL DEFAULT 60,
            min_withdrawal_paise INTEGER NOT NULL DEFAULT 10000,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO platform_revenue_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM platform_revenue_settings WHERE id = 1);
        CREATE TABLE IF NOT EXISTS owner_wallets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            balance_paise INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_owner_wallets_user_id ON owner_wallets (user_id);
        CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
            id SERIAL PRIMARY KEY,
            wallet_id INTEGER NOT NULL REFERENCES owner_wallets(id) ON DELETE CASCADE,
            amount_paise INTEGER NOT NULL,
            entry_type VARCHAR NOT NULL,
            description VARCHAR,
            reference_id VARCHAR,
            listener_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_wallet_ledger_entries_wallet_id ON wallet_ledger_entries (wallet_id);
        CREATE TABLE IF NOT EXISTS owner_bank_accounts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            account_holder_name VARCHAR NOT NULL,
            bank_name VARCHAR,
            account_number VARCHAR NOT NULL,
            ifsc_code VARCHAR NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_owner_bank_accounts_user_id ON owner_bank_accounts (user_id);
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount_paise INTEGER NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            admin_note VARCHAR,
            processed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            processed_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_withdrawal_requests_user_id ON withdrawal_requests (user_id);
        CREATE TABLE IF NOT EXISTS billable_track_plays (
            id SERIAL PRIMARY KEY,
            listener_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            listened_seconds FLOAT NOT NULL,
            credit_paise INTEGER NOT NULL,
            play_date VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_billable_track_plays_listener_track_day UNIQUE (listener_user_id, track_id, play_date)
        );
        CREATE INDEX IF NOT EXISTS ix_billable_track_plays_owner ON billable_track_plays (owner_user_id);
        CREATE TABLE IF NOT EXISTS radio_listen_sessions (
            id SERIAL PRIMARY KEY,
            session_token VARCHAR NOT NULL UNIQUE,
            listener_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            station_id INTEGER NOT NULL REFERENCES radio_stations(id) ON DELETE CASCADE,
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            total_seconds INTEGER NOT NULL DEFAULT 0,
            total_credit_paise INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            last_heartbeat_at TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_radio_listen_sessions_listener ON radio_listen_sessions (listener_user_id);
        CREATE INDEX IF NOT EXISTS ix_radio_listen_sessions_station ON radio_listen_sessions (station_id);
    """),
    ("015_encrypt_saved_bank_accounts", """
        -- Intentionally empty: older builds wiped saved bank accounts here.
        -- Encryption is applied on read/write in wallet_service (legacy plaintext tolerated).
        SELECT 1;
    """),
    ("016_withdrawal_payout_bank_snapshot", """
        ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR;
        ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS bank_name VARCHAR;
        ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS account_number_masked VARCHAR;
        ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR;
        ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS utr_reference VARCHAR;
    """),
    ("017_clear_plaintext_withdrawal_bank_snapshots", """
        UPDATE withdrawal_requests
        SET account_holder_name = NULL,
            bank_name = NULL,
            account_number_masked = NULL,
            ifsc_code = NULL
        WHERE account_holder_name IS NOT NULL
          AND account_holder_name NOT LIKE 'gAAAA%';
    """),
    ("018_licence_document_paths", """
        ALTER TABLE radio_stations ADD COLUMN IF NOT EXISTS licence_document_path VARCHAR;
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS licence_document_path VARCHAR;
    """),
    ("019_profile_cover_images", """
        ALTER TABLE artists ADD COLUMN IF NOT EXISTS cover_image_path VARCHAR;
    """),
    ("020_user_profile_images", """
        ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_path VARCHAR;
    """),
    ("021_track_comments", """
        CREATE TABLE IF NOT EXISTS track_comments (
            id SERIAL PRIMARY KEY,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body VARCHAR NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_track_comments_track_id ON track_comments (track_id);
        CREATE INDEX IF NOT EXISTS ix_track_comments_user_id ON track_comments (user_id);
    """),
    ("022_daily_settlement", """
        ALTER TABLE platform_revenue_settings
            ADD COLUMN IF NOT EXISTS daily_settlement_enabled BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE platform_revenue_settings
            ADD COLUMN IF NOT EXISTS min_valid_daily_listen_seconds INTEGER NOT NULL DEFAULT 1;

        ALTER TABLE subscription_payments
            ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMP;
        ALTER TABLE subscription_payments
            ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMP;

        CREATE INDEX IF NOT EXISTS ix_billable_track_plays_play_date
            ON billable_track_plays (play_date);
        CREATE INDEX IF NOT EXISTS ix_billable_track_plays_listener_date
            ON billable_track_plays (listener_user_id, play_date);

        CREATE TABLE IF NOT EXISTS daily_settlement_runs (
            id SERIAL PRIMARY KEY,
            settlement_date VARCHAR NOT NULL UNIQUE,
            status VARCHAR NOT NULL DEFAULT 'pending',
            listeners_processed INTEGER NOT NULL DEFAULT 0,
            owners_credited INTEGER NOT NULL DEFAULT 0,
            total_credited_paise INTEGER NOT NULL DEFAULT 0,
            error_message VARCHAR,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS ix_daily_settlement_runs_settlement_date
            ON daily_settlement_runs (settlement_date);

        CREATE TABLE IF NOT EXISTS daily_settlement_credits (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES daily_settlement_runs(id) ON DELETE CASCADE,
            settlement_date VARCHAR NOT NULL,
            owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount_paise INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_daily_settlement_credits_date_owner UNIQUE (settlement_date, owner_user_id)
        );
        CREATE INDEX IF NOT EXISTS ix_daily_settlement_credits_run_id
            ON daily_settlement_credits (run_id);
        CREATE INDEX IF NOT EXISTS ix_daily_settlement_credits_owner
            ON daily_settlement_credits (owner_user_id);
        CREATE INDEX IF NOT EXISTS ix_daily_settlement_credits_date
            ON daily_settlement_credits (settlement_date);
    """),
    ("023_track_metadata_tags", """
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS track_number INTEGER;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS album_artist VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS comment VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS copyright_text VARCHAR;
    """),
    ("024_tracks_hls_quality_paths", """
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS hls_normal_path VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS hls_high_path VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS hls_lossless_path VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS hls_hires_path VARCHAR;
    """),
    ("025_tracks_lyrics_timed", """
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_timed JSONB;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_language VARCHAR;
        ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_language_probability FLOAT;
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
