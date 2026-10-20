-- Legacy admin authorization snapshot used during the staged Java-to-Go cutover.
-- The Java admin login remains the issuer initially; Go validates its signed JWT
-- and active Redis session, then resolves current roles and permissions here.
CREATE TABLE sys_user (
    user_id BIGINT PRIMARY KEY,
    dept_id BIGINT,
    user_name VARCHAR(64) NOT NULL,
    nick_name VARCHAR(64),
    email VARCHAR(128),
    phonenumber VARCHAR(32),
    sex CHAR(1),
    avatar VARCHAR(255),
    password VARCHAR(100) NOT NULL,
    status CHAR(1) NOT NULL DEFAULT '0',
    del_flag CHAR(1) NOT NULL DEFAULT '0',
    login_ip VARCHAR(128),
    login_date TIMESTAMP WITHOUT TIME ZONE,
    pwd_update_date TIMESTAMP WITHOUT TIME ZONE,
    create_by VARCHAR(64),
    create_time TIMESTAMP WITHOUT TIME ZONE,
    update_by VARCHAR(64),
    update_time TIMESTAMP WITHOUT TIME ZONE,
    remark VARCHAR(500)
);
CREATE INDEX idx_sys_user_name ON sys_user (user_name);

CREATE TABLE sys_role (
    role_id BIGINT PRIMARY KEY,
    role_name VARCHAR(64),
    role_key VARCHAR(100) NOT NULL,
    role_sort INTEGER,
    data_scope CHAR(1),
    status CHAR(1) NOT NULL DEFAULT '0',
    del_flag CHAR(1) NOT NULL DEFAULT '0',
    create_time TIMESTAMP WITHOUT TIME ZONE,
    remark VARCHAR(500)
);

CREATE TABLE sys_user_role (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_sys_user_role_role ON sys_user_role (role_id, user_id);

CREATE TABLE sys_role_menu (
    role_id BIGINT NOT NULL,
    menu_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, menu_id)
);
CREATE INDEX idx_sys_role_menu_menu ON sys_role_menu (menu_id, role_id);

CREATE TABLE sys_menu (
    menu_id BIGINT PRIMARY KEY,
    menu_name VARCHAR(64),
    parent_id BIGINT,
    order_num INTEGER,
    path VARCHAR(255),
    component VARCHAR(255),
    menu_type CHAR(1),
    visible CHAR(1),
    status CHAR(1) NOT NULL DEFAULT '0',
    perms VARCHAR(100),
    icon VARCHAR(100),
    create_time TIMESTAMP WITHOUT TIME ZONE,
    remark VARCHAR(500)
);
CREATE INDEX idx_sys_menu_status_type ON sys_menu (status, menu_type);
