-- Go only consumes admin identity and RBAC during the Java-login transition.
-- Keep legacy password hashes in MySQL; they are not needed by Go authorization.
ALTER TABLE sys_user DROP COLUMN IF EXISTS password;