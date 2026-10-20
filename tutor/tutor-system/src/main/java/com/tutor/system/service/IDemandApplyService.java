package com.tutor.system.service;

import java.util.List;
import com.tutor.system.domain.DemandApply;

/**
 * 老师「申请联系」学生需求
 *
 * @author 家教中介平台
 */
public interface IDemandApplyService
{
    /** 老师申请某条需求；已申请过会抛 400 */
    DemandApply apply(Long teacherId, Long demandId, String message);

    /** 我（老师）申请过的需求ID */
    List<Long> appliedDemandIds(Long teacherId);

    /** 我（学生）收到的申请 */
    List<DemandApply> receivedByStudent(Long studentId);

    /** 某条需求收到的申请数 */
    int countByDemand(Long demandId);
}
