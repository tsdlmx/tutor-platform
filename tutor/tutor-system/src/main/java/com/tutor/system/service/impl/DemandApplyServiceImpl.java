package com.tutor.system.service.impl;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import com.tutor.common.exception.ServiceException;
import com.tutor.system.domain.DemandApply;
import com.tutor.system.domain.StudentDemand;
import com.tutor.system.mapper.DemandApplyMapper;
import com.tutor.system.mapper.StudentDemandMapper;
import com.tutor.system.service.IDemandApplyService;

/**
 * 老师申请联系需求的实现
 *
 * @author 家教中介平台
 */
@Service
public class DemandApplyServiceImpl implements IDemandApplyService
{
    /** 留言上限 */
    private static final int MESSAGE_MAX = 500;

    @Autowired
    private DemandApplyMapper demandApplyMapper;

    @Autowired
    private StudentDemandMapper studentDemandMapper;

    @Override
    public DemandApply apply(Long teacherId, Long demandId, String message)
    {
        StudentDemand demand = studentDemandMapper.selectDemandById(demandId);
        if (demand == null)
        {
            throw new ServiceException("需求不存在或已删除", 404);
        }
        // 已取消的需求不再接受申请
        if ("3".equals(demand.getStatus()))
        {
            throw new ServiceException("该需求已取消，无法申请", 400);
        }
        if (demandApplyMapper.selectByDemandAndTeacher(demandId, teacherId) != null)
        {
            throw new ServiceException("你已经申请过这条需求了", 400);
        }
        String text = message == null ? null : message.trim();
        if (text != null && text.length() > MESSAGE_MAX)
        {
            throw new ServiceException("留言不能超过 " + MESSAGE_MAX + " 字", 400);
        }
        if (text != null && text.isEmpty())
        {
            text = null;
        }

        DemandApply apply = new DemandApply();
        apply.setDemandId(demandId);
        apply.setTeacherId(teacherId);
        apply.setMessage(text);
        try
        {
            demandApplyMapper.insertApply(apply);
        }
        catch (DuplicateKeyException e)
        {
            // 唯一键 uk_apply_demand_teacher：并发双击时上面那次查询可能都通过，
            // 真正兜底的是数据库唯一键，这里把它翻译成人话而不是 500
            throw new ServiceException("你已经申请过这条需求了", 400);
        }
        return demandApplyMapper.selectByDemandAndTeacher(demandId, teacherId);
    }

    @Override
    public List<Long> appliedDemandIds(Long teacherId)
    {
        return demandApplyMapper.selectAppliedDemandIds(teacherId);
    }

    @Override
    public List<DemandApply> receivedByStudent(Long studentId)
    {
        return demandApplyMapper.selectByStudent(studentId);
    }

    @Override
    public int countByDemand(Long demandId)
    {
        return demandApplyMapper.countByDemand(demandId);
    }
}
