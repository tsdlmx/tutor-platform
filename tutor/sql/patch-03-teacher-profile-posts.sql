-- ============================================================================
-- 个人主页：老师简历 + 帖子
-- ----------------------------------------------------------------------------
-- 「我的」页面升级成个人社交主页：
--   * 老师可以填一份个人简历（t_teacher_profile，与账号 1:1）；
--   * 所有客户都可以发帖子（t_user_post），帖子会出现在自己的主页上。
-- 两张表都挂在客户账号（t_customer_account.account_id）上，与若依的 sys_user 无关。
--
-- 可重复执行（都是 IF NOT EXISTS）。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `t_teacher_profile` (
  `account_id`       BIGINT       NOT NULL                COMMENT '账号ID -> t_customer_account.account_id',
  `real_name`        VARCHAR(64)           DEFAULT NULL   COMMENT '真实姓名',
  `gender`           CHAR(1)               DEFAULT '0'    COMMENT '性别 0未知 1男 2女',
  `age`              INT                   DEFAULT NULL   COMMENT '年龄',
  `city`             VARCHAR(64)           DEFAULT NULL   COMMENT '所在城市',
  `education`        VARCHAR(32)           DEFAULT NULL   COMMENT '学历：专科/本科/硕士/博士/在读',
  `school`           VARCHAR(128)          DEFAULT NULL   COMMENT '毕业院校',
  `major`            VARCHAR(128)          DEFAULT NULL   COMMENT '专业',
  `subjects`         VARCHAR(255)          DEFAULT NULL   COMMENT '可授科目，逗号分隔',
  `grades`           VARCHAR(255)          DEFAULT NULL   COMMENT '可授年级，逗号分隔',
  `hourly_rate`      DECIMAL(10,2)         DEFAULT NULL   COMMENT '期望时薪（元/小时）',
  `experience_years` INT                   DEFAULT NULL   COMMENT '教龄（年）',
  `available_time`   VARCHAR(255)          DEFAULT NULL   COMMENT '可授课时间',
  `intro`            TEXT                                  COMMENT '自我介绍 / 教学风格',
  `certificates`     TEXT                                  COMMENT '证书与荣誉',
  `contact`          VARCHAR(128)          DEFAULT NULL   COMMENT '联系方式',
  `create_time`      DATETIME              DEFAULT NULL   COMMENT '创建时间',
  `update_time`      DATETIME              DEFAULT NULL   COMMENT '更新时间',
  PRIMARY KEY (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='老师个人简历';

CREATE TABLE IF NOT EXISTS `t_user_post` (
  `post_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '帖子ID',
  `account_id`  BIGINT       NOT NULL                COMMENT '作者账号ID -> t_customer_account.account_id',
  `content`     TEXT         NOT NULL                COMMENT '正文',
  `images`      VARCHAR(1000)         DEFAULT NULL   COMMENT '图片地址，逗号分隔（可选）',
  `del_flag`    CHAR(1)               DEFAULT '0'    COMMENT '删除标记 0存在 2删除',
  `create_time` DATETIME              DEFAULT NULL   COMMENT '发布时间',
  `update_time` DATETIME              DEFAULT NULL   COMMENT '更新时间',
  PRIMARY KEY (`post_id`),
  KEY `idx_post_account` (`account_id`),
  KEY `idx_post_create` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='个人主页帖子';
