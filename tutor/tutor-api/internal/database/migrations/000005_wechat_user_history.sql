-- Minimal historical miniapp data needed by the existing admin list and detail UI.
-- Parent table intentionally contains only the join key and display identifier.
CREATE TABLE t_parent_info (
    parent_id BIGINT PRIMARY KEY,
    parent_no TEXT
);

CREATE TABLE t_wx_user (
    user_id BIGINT PRIMARY KEY,
    openid TEXT,
    unionid TEXT,
    inviter_id BIGINT,
    nickname TEXT,
    avatar TEXT,
    gender INTEGER,
    phone TEXT,
    user_type TEXT,
    parent_id BIGINT,
    tutor_id BIGINT,
    status CHAR(1),
    del_flag CHAR(1) DEFAULT '0',
    create_time TIMESTAMP WITHOUT TIME ZONE,
    update_time TIMESTAMP WITHOUT TIME ZONE,
    last_login_time TIMESTAMP WITHOUT TIME ZONE,
    remark TEXT,
    points NUMERIC(14,2),
    avg_rating NUMERIC(8,2),
    total_evaluations INTEGER
);

CREATE INDEX idx_wx_user_active_created
    ON t_wx_user (create_time DESC, user_id DESC)
    WHERE del_flag = '0';