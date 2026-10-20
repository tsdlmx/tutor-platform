package com.tutor.system.service;

import java.util.List;
import java.util.Map;
import com.tutor.system.domain.StudentDemand;

/**
 * 学生需求单 Service
 *
 * @author 家教中介平台
 */
public interface IStudentDemandService
{
    /** 老师端：所有学生发布的需求（不含已取消） */
    List<StudentDemand> selectForTeacher(StudentDemand query);

    /** 学生端：自己的需求（含各状态） */
    List<StudentDemand> selectForStudent(Long studentId, StudentDemand query);

    /** 详情 */
    StudentDemand selectById(Long demandId);

    /** 发布需求（会做字段校验与科目数组 -> 字符串的转换） */
    StudentDemand publish(Long studentId, StudentDemand demand);

    /** 修改自己的需求；返回 null 表示无权或不存在 */
    StudentDemand updateOwn(Long studentId, Long demandId, StudentDemand demand);

    /** 删除自己的需求 */
    boolean deleteOwn(Long studentId, Long demandId);

    /** 改自己需求的状态 */
    boolean updateOwnStatus(Long studentId, Long demandId, String status);

    /** 老师端首页统计 */
    Map<String, Object> stats();
}
