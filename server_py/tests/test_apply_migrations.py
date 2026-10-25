from scripts import apply_migrations


def test_production_manual_migrations_exclude_development_seed_data():
    assert "09_seed_data.sql" not in apply_migrations.get_migration_filenames("production")


def test_development_manual_migrations_include_seed_data():
    assert "09_seed_data.sql" in apply_migrations.get_migration_filenames("development")
