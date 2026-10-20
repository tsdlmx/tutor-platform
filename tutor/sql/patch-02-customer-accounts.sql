-- ============================================================================
-- 客户账号 + 学生需求单
-- ----------------------------------------------------------------------------
-- 背景：平台原来靠微信小程序登录（t_wx_user），需要企业资质、还要短信通道，
-- 这里改成「邮箱 + 密码」的客户账号体系，与若依的管理后台账号（sys_user）
-- 完全隔离：
--   * 客户账号只存在于 t_customer_account，不进 sys_user；
--   * 客户 token 由独立的 CustomerTokenService 签发、独立的拦截器校验，
--     因此客户永远拿不到 /system/** 这类管理接口。
-- 注册时不选身份，注册后由客户自己选择老师 / 学生。
--
-- 可重复执行（都是 IF NOT EXISTS）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `t_customer_account` (
  `account_id`      BIGINT       NOT NULL AUTO_INCREMENT COMMENT '账号ID',
  `email`           VARCHAR(128) NOT NULL                COMMENT '邮箱（登录名）',
  `password`        VARCHAR(100) NOT NULL                COMMENT 'BCrypt 密码哈希',
  `nickname`        VARCHAR(64)           DEFAULT NULL   COMMENT '昵称',
  `role`            VARCHAR(16)           DEFAULT NULL   COMMENT '身份 TEACHER/STUDENT，NULL=还没选',
  `status`          CHAR(1)               DEFAULT '0'    COMMENT '状态 0正常 1停用',
  `last_login_time` DATETIME              DEFAULT NULL   COMMENT '最后登录时间',
  `create_time`     DATETIME              DEFAULT NULL   COMMENT '注册时间',
  `update_time`     DATETIME              DEFAULT NULL   COMMENT '更新时间',
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uk_customer_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户账号（邮箱注册，与 sys_user 隔离）';

CREATE TABLE IF NOT EXISTS `t_student_demand` (
  `demand_id`   BIGINT        NOT NULL AUTO_INCREMENT COMMENT '需求ID',
  `student_id`  BIGINT        NOT NULL                COMMENT '学生账号ID -> t_customer_account.account_id',
  `title`       VARCHAR(128)  NOT NULL                COMMENT '需求标题',
  `subjects`    VARCHAR(255)  NOT NULL                COMMENT '科目，逗号分隔（如 数学,物理）',
  `grade`       VARCHAR(32)            DEFAULT NULL   COMMENT '年级',
  `budget_min`  DECIMAL(10,2)          DEFAULT NULL   COMMENT '预算下限（元）',
  `budget_max`  DECIMAL(10,2)          DEFAULT NULL   COMMENT '预算上限（元）',
  `budget_unit` VARCHAR(16)            DEFAULT 'hour' COMMENT '预算单位 hour/lesson/month',
  `class_mode`  VARCHAR(16)            DEFAULT 'both' COMMENT '授课方式 online/offline/both',
  `city`        VARCHAR(64)            DEFAULT NULL   COMMENT '所在城市',
  `description` TEXT                                  COMMENT '需求详细描述',
  `status`      CHAR(1)                DEFAULT '0'    COMMENT '状态 0待接单 1已接单 2已完成 3已取消',
  `del_flag`    CHAR(1)                DEFAULT '0'    COMMENT '删除标记 0存在 2删除',
  `create_time` DATETIME               DEFAULT NULL   COMMENT '发布时间',
  `update_time` DATETIME               DEFAULT NULL   COMMENT '更新时间',
  PRIMARY KEY (`demand_id`),
  KEY `idx_demand_student` (`student_id`),
  KEY `idx_demand_status` (`status`),
  KEY `idx_demand_create` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='学生需求单（老师端可见）';
