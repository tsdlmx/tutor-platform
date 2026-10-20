-- Minimum department hierarchy and role-to-department mapping needed to enforce
-- the legacy system-user list data scope in Go.
CREATE TABLE sys_dept (
    dept_id BIGINT PRIMARY KEY,
    parent_id BIGINT,
    ancestors TEXT,
    dept_name TEXT,
    status CHAR(1),
    del_flag CHAR(1)
);
CREATE INDEX idx_sys_dept_parent_id ON sys_dept (parent_id);

CREATE TABLE sys_role_dept (
    role_id BIGINT NOT NULL,
    dept_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, dept_id)
);

CREATE INDEX idx_sys_user_dept_id ON sys_user (dept_id, user_id);