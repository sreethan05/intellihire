from app.migration_runner import discover_migration_files


def test_discover_migration_files_excludes_seed_and_test_reset_scripts(tmp_path):
    for filename in (
        "01_initial_schema.sql",
        "09_seed_data.sql",
        "14_data_retention.sql",
        "20_cleanup_test_users.sql",
    ):
        (tmp_path / filename).write_text("SELECT 1;", encoding="utf-8")

    migration_names = [
        path.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        for path in discover_migration_files(str(tmp_path))
    ]

    assert migration_names == ["01_initial_schema.sql", "14_data_retention.sql"]
