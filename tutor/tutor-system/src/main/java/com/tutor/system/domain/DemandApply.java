package com.tutor.system.domain;

import java.util.Date;
import com.tutor.common.core.domain.BaseEntity;

/**
 * 老师对需求的「申请联系」
 *
 * 老师看到学生需求后点「申请联系」→ 写入这张表；
 * 学生在自己「我的」页面的「老师申请」模块里看到这些申请。
 *
 * @author 家教中介平台
 */
public class DemandApply extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 申请ID */
    private Long applyId;

    /** 需求ID */
    private Long demandId;

    /** 老师账号ID */
    private Long teacherId;

    /** 申请留言 */
    private String message;

    /** 状态 0待处理 1已同意 2已拒绝 */
    private String status;

    private Date createTime;

    private Date updateTime;

    /* ---------------- 展示字段，不落库 ---------------- */

    /** 需求标题（学生视角展示用） */
    private String demandTitle;

    /** 需求科目 */
    private String demandSubjects;

    /** 需求年级 */
    private String demandGrade;

    /** 老师昵称 */
    private String teacherName;

    /** 老师身份（固定 TEACHER，前端展示用） */
    private String teacherRole;

    public Long getApplyId()
    {
        return applyId;
    }

    public void setApplyId(Long applyId)
    {
        this.applyId = applyId;
    }

    public Long getDemandId()
    {
        return demandId;
    }

    public void setDemandId(Long demandId)
    {
        this.demandId = demandId;
    }

    public Long getTeacherId()
    {
        return teacherId;
    }

    public void setTeacherId(Long teacherId)
    {
        this.teacherId = teacherId;
    }

    public String getMessage()
    {
        return message;
    }

    public void setMessage(String message)
    {
        this.message = message;
    }

    public String getStatus()
    {
        return status;
    }

    public void setStatus(String status)
    {
        this.status = status;
    }

    @Override
    public Date getCreateTime()
    {
        return createTime;
    }

    @Override
    public void setCreateTime(Date createTime)
    {
        this.createTime = createTime;
    }

    @Override
    public Date getUpdateTime()
    {
        return updateTime;
    }

    @Override
    public void setUpdateTime(Date updateTime)
    {
        this.updateTime = updateTime;
    }

    public String getDemandTitle()
    {
        return demandTitle;
    }

    public void setDemandTitle(String demandTitle)
    {
        this.demandTitle = demandTitle;
    }

    public String getDemandSubjects()
    {
        return demandSubjects;
    }

    public void setDemandSubjects(String demandSubjects)
    {
        this.demandSubjects = demandSubjects;
    }

    public String getDemandGrade()
    {
        return demandGrade;
    }

    public void setDemandGrade(String demandGrade)
    {
        this.demandGrade = demandGrade;
    }

    public String getTeacherName()
    {
        return teacherName;
    }

    public void setTeacherName(String teacherName)
    {
        this.teacherName = teacherName;
    }

    public String getTeacherRole()
    {
        return teacherRole;
    }

    public void setTeacherRole(String teacherRole)
    {
        this.teacherRole = teacherRole;
    }
}
