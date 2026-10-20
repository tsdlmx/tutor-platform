package com.tutor.system.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import com.tutor.system.domain.DemandApply;

/**
 * 需求申请 Mapper
 *
 * @author 家教中介平台
 */
public interface DemandApplyMapper
{
    /** 新增申请 */
    int insertApply(DemandApply apply);

    /** 我（老师）对某条需求的申请（不存在返回 null） */
    DemandApply selectByDemandAndTeacher(@Param("demandId") Long demandId,
                                         @Param("teacherId") Long teacherId);

    /** 我（老师）申请过的需求ID列表（前端用来把按钮变成「已申请」） */
    List<Long> selectAppliedDemandIds(@Param("teacherId") Long teacherId);

    /** 我（学生）发布的需求收到的申请（按时间倒序） */
    List<DemandApply> selectByStudent(@Param("studentId") Long studentId);

    /** 某条需求的申请数（老师端展示「N 位老师已申请」） */
    int countByDemand(@Param("demandId") Long demandId);

    /** 某条需求的申请ID列表 */
    List<Long> selectApplyIdsByDemand(@Param("demandId") Long demandId);

    /** 改状态（学生同意/拒绝） */
    int updateStatus(@Param("applyId") Long applyId, @Param("status") String status);
}
