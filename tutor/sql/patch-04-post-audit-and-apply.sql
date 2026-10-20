-- ============================================================================
-- 04) 帖子审核 + 老师申请联系需求
-- ----------------------------------------------------------------------------
-- 幂等：重复执行不会报错（用 information_schema 判断列是否存在）
-- ============================================================================

-- 1) 帖子审核：新增审核状态、备注、审核时间
SET @db := DATABASE();

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema=@db AND table_name='t_user_post' AND column_name='audit_status'),
    'SELECT ''audit_status 已存在'' AS msg',
    'ALTER TABLE t_user_post ADD COLUMN audit_status char(1) NOT NULL DEFAULT ''0'' COMMENT ''审核状态 0待审核 1通过 2拒绝'' AFTER images'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema=@db AND table_name='t_user_post' AND column_name='audit_remark'),
    'SELECT ''audit_remark 已存在'' AS msg',
    'ALTER TABLE t_user_post ADD COLUMN audit_remark varchar(255) DEFAULT NULL COMMENT ''审核备注（拒绝理由）'' AFTER audit_status'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema=@db AND table_name='t_user_post' AND column_name='audit_time'),
    'SELECT ''audit_time 已存在'' AS msg',
    'ALTER TABLE t_user_post ADD COLUMN audit_time datetime DEFAULT NULL COMMENT ''审核时间'' AFTER audit_remark'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (
  SELECT IF(
    EXISTS(SELECT 1 FROM information_schema.statistics
           WHERE table_schema=@db AND table_name='t_user_post' AND index_name='idx_post_audit'),
    'SELECT ''idx_post_audit 已存在'' AS msg',
    'ALTER TABLE t_user_post ADD INDEX idx_post_audit (audit_status)'
  )
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史帖子（审核机制上线前发的）视为已通过，避免广场突然全空
UPDATE t_user_post SET audit_status = '1' WHERE audit_status = '0' AND create_time < NOW();

-- 2) 老师「申请联系」学生需求
CREATE TABLE IF NOT EXISTS `t_demand_apply` (
  `apply_id`    bigint      NOT NULL AUTO_INCREMENT COMMENT '申请ID',
  `demand_id`   bigint      NOT NULL COMMENT '需求ID -> t_student_demand.demand_id',
  `teacher_id`  bigint      NOT NULL COMMENT '老师账号ID -> t_customer_account.account_id',
  `message`     varchar(500)         DEFAULT NULL COMMENT '申请说明（老师留言）',
  `status`      char(1)     NOT NULL  DEFAULT '0' COMMENT '状态 0待处理 1已同意 2已拒绝',
  `create_time` datetime             DEFAULT NULL COMMENT '申请时间',
  `update_time` datetime             DEFAULT NULL COMMENT '更新时间',
  PRIMARY KEY (`apply_id`),
  UNIQUE KEY `uk_apply_demand_teacher` (`demand_id`, `teacher_id`),
  KEY `idx_apply_demand` (`demand_id`),
  KEY `idx_apply_teacher` (`teacher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='老师对需求的申请（申请联系）';
