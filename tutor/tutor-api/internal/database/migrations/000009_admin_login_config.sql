-- Snapshot only the legacy settings that affect administrator login security.
-- Other application settings remain outside this Go-owned table.
CREATE TABLE sys_admin_auth_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT NOT NULL
);
