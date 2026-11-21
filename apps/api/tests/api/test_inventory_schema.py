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


def test_inventory_review_decisions_and_in_review_status(db):
    status_check = db.execute(
        text(
            """
            SELECT pg_get_constraintdef(oid)
            FROM pg_constraint
            WHERE conname = 'ck_inventory_sessions_status'
            """
        )
    ).scalar_one()
    assert "in_review" in status_check

    columns = set(
        db.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'libraryhub'
                  AND table_name = 'inventory_review_decisions'
                """
            )
        ).scalars()
    )
    assert columns == {
        "id",
        "session_id",
        "scan_id",
        "action",
        "decision",
        "decided_by",
        "decided_at",
    }

    unique_scan = db.execute(
        text(
            """
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'uq_inventory_review_decisions_scan_id'
            """
        )
    ).scalar_one_or_none()
    assert unique_scan == 1