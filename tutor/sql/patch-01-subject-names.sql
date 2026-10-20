-- ============================================================================
-- 补丁 01：修复「按科目名称筛选家教」永远查不到数据的问题
-- ----------------------------------------------------------------------------
-- 问题现象：
--   小程序/前台按科目名筛选（GET /miniapp/tutor/list?subject=数学）永远返回空。
-- 根本原因：
--   TTutorInfoMapper.xml 的 resultMap 把属性 subjectNames 映射到列 subject_names，
--   但 t_tutor_info 表里并没有 subject_names 这一列（只有 subject_ids），
--   并且 select 语句里也没有查询该列 —— 于是 getSubjectNames() 恒为 null，
--   而 MiniappTutorController 里是用 subjectNames.contains(科目名) 做筛选的。
-- 处理方式：
--   1) 新增冗余列 subject_names 并回填（本文件）
--   2) mapper 的 select 增加 t.subject_names（已随本次交付一并修改）
-- 说明：
--   库里没有 t_subject 科目字典表，科目名无法通过关联查询得到，
--   所以这里采用冗余存储，与原设计意图一致。
-- ============================================================================

ALTER TABLE `t_tutor_info`
  ADD COLUMN `subject_names` varchar(500) DEFAULT NULL
  COMMENT '可授科目名称，逗号分隔（冗余列，便于按科目名称筛选）'
  AFTER `subject_ids`;

-- 回填：按 subject_ids 对应的科目字典把 ID 翻译成名称
-- subject_ids 是逗号分隔的数字，科目字典与原 t_subject 种子数据一致：
--   1语文 2数学 3英语 4物理 5化学 6生物 7政治 8历史 9地理 10奥数 11科学 12陪读 13信息技术
UPDATE `t_tutor_info` SET `subject_names` = TRIM(BOTH ',' FROM CONCAT_WS(',',
    CASE WHEN FIND_IN_SET('1',  `subject_ids`) THEN '语文'     END,
    CASE WHEN FIND_IN_SET('2',  `subject_ids`) THEN '数学'     END,
    CASE WHEN FIND_IN_SET('3',  `subject_ids`) THEN '英语'     END,
    CASE WHEN FIND_IN_SET('4',  `subject_ids`) THEN '物理'     END,
    CASE WHEN FIND_IN_SET('5',  `subject_ids`) THEN '化学'     END,
    CASE WHEN FIND_IN_SET('6',  `subject_ids`) THEN '生物'     END,
    CASE WHEN FIND_IN_SET('7',  `subject_ids`) THEN '政治'     END,
    CASE WHEN FIND_IN_SET('8',  `subject_ids`) THEN '历史'     END,
    CASE WHEN FIND_IN_SET('9',  `subject_ids`) THEN '地理'     END,
    CASE WHEN FIND_IN_SET('10', `subject_ids`) THEN '奥数'     END,
    CASE WHEN FIND_IN_SET('11', `subject_ids`) THEN '科学'     END,
    CASE WHEN FIND_IN_SET('12', `subject_ids`) THEN '陪读'     END,
    CASE WHEN FIND_IN_SET('13', `subject_ids`) THEN '信息技术' END
))
WHERE `subject_ids` IS NOT NULL AND `subject_ids` <> '';
