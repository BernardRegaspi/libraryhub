from sqlalchemy import text


def test_inventory_tables_and_primary_uniqueness(db):
    names = set(
        db.execute(
            text(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'libraryhub'
                  AND table_name IN ('inventory_sessions', 'inventory_scans')
                """
            )
        ).scalars()
    )
    assert names == {"inventory_sessions", "inventory_scans"}
    sequence = db.execute(
        text("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'libraryhub' AND c.relname = 'inventory_session_ref_seq'")
    ).scalar_one_or_none()
    assert sequence == 1