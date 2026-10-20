package com.tutor.system.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import com.tutor.system.domain.StudentDemand;

/**
 * 学生需求单 Mapper
 *
 * @author 家教中介平台
 */
public interface StudentDemandMapper
{
    /** 列表查询（老师端查全部、学生端按 studentId 过滤，共用这一条） */
    List<StudentDemand> selectDemandList(StudentDemand query);

    /** 详情 */
    StudentDemand selectDemandById(@Param("demandId") Long demandId);

    /** 新增 */
    int insertDemand(StudentDemand demand);

    /** 修改（只更新内容字段，不动 student_id） */
    int updateDemand(StudentDemand demand);

    /** 逻辑删除 */
    int deleteDemandById(@Param("demandId") Long demandId);

    /** 改状态 */
    int updateStatus(@Param("demandId") Long demandId, @Param("status") String status);

    /** 统计：总数（可按状态过滤） */
    int countDemands(@Param("status") String status);

    /** 统计：平均预算（按上限算） */
    java.math.BigDecimal avgBudget();

    /** 统计：科目分布（subjects 是逗号分隔，这里按行取回来在 Java 里拆） */
    List<String> selectAllSubjectStrings();
}
