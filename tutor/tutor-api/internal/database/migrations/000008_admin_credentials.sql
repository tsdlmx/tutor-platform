-- Keep administrator password hashes isolated from the profile and RBAC tables.
-- Hashes are copied from legacy MySQL only by the explicit legacy importer.
CREATE TABLE sys_user_auth (
    user_id BIGINT PRIMARY KEY REFERENCES sys_user(user_id) ON DELETE CASCADE,
    password_hash VARCHAR(100) NOT NULL
);
