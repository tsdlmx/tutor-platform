package com.tutor.system.domain;

import java.math.BigDecimal;
import java.util.List;
import com.tutor.common.core.domain.BaseEntity;

/**
 * 学生需求单
 *
 * 学生在客户端描述自己的需求（科目 + 给老师的预算），
 * 老师端在 /teacher 列出所有学生发布的需求。
 *
 * @author 家教中介平台
 */
public class StudentDemand extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 待接单 */
    public static final String STATUS_OPEN = "0";

    /** 已接单 */
    public static final String STATUS_ACCEPTED = "1";

    /** 已完成 */
    public static final String STATUS_DONE = "2";

    /** 已取消 */
    public static final String STATUS_CANCELLED = "3";

    /** 需求ID */
    private Long demandId;

    /** 学生账号ID */
    private Long studentId;

    /** 需求标题 */
    private String title;

    /** 科目，逗号分隔（存库形态，如 "数学,物理"） */
    private String subjects;

    /** 年级 */
    private String grade;

    /** 预算下限 */
    private BigDecimal budgetMin;

    /** 预算上限 */
    private BigDecimal budgetMax;

    /** 预算单位 hour/lesson/month */
    private String budgetUnit;

    /** 授课方式 online/offline/both */
    private String classMode;

    /** 所在城市 */
    private String city;

    /** 需求详细描述 */
    private String description;

    /** 状态 */
    private String status;

    /** 删除标记 */
    private String delFlag;

    /* ---------------- 以下为查询条件 / 展示字段，不落库 ---------------- */

    /** 前端传入的科目数组（写入时转成 subjects 字符串） */
    private List<String> subjectList;

    /** 学生昵称（老师端列表展示） */
    private String studentName;

    /** 状态中文（列表展示，省得前端再维护一份映射） */
    private String statusText;

    /** 查询条件：科目名模糊匹配 */
    private String subject;

    /** 查询条件：关键词（标题/描述） */
    private String keyword;

    public Long getDemandId()
    {
        return demandId;
    }

    public void setDemandId(Long demandId)
    {
        this.demandId = demandId;
    }

    public Long getStudentId()
    {
        return studentId;
    }

    public void setStudentId(Long studentId)
    {
        this.studentId = studentId;
    }

    public String getTitle()
    {
        return title;
    }

    public void setTitle(String title)
    {
        this.title = title;
    }

    public String getSubjects()
    {
        return subjects;
    }

    public void setSubjects(String subjects)
    {
        this.subjects = subjects;
    }

    public String getGrade()
    {
        return grade;
    }

    public void setGrade(String grade)
    {
        this.grade = grade;
    }

    public BigDecimal getBudgetMin()
    {
        return budgetMin;
    }

    public void setBudgetMin(BigDecimal budgetMin)
    {
        this.budgetMin = budgetMin;
    }

    public BigDecimal getBudgetMax()
    {
        return budgetMax;
    }

    public void setBudgetMax(BigDecimal budgetMax)
    {
        this.budgetMax = budgetMax;
    }

    public String getBudgetUnit()
    {
        return budgetUnit;
    }

    public void setBudgetUnit(String budgetUnit)
    {
        this.budgetUnit = budgetUnit;
    }

    public String getClassMode()
    {
        return classMode;
    }

    public void setClassMode(String classMode)
    {
        this.classMode = classMode;
    }

    public String getCity()
    {
        return city;
    }

    public void setCity(String city)
    {
        this.city = city;
    }

    public String getDescription()
    {
        return description;
    }

    public void setDescription(String description)
    {
        this.description = description;
    }

    public String getStatus()
    {
        return status;
    }

    public void setStatus(String status)
    {
        this.status = status;
    }

    public String getDelFlag()
    {
        return delFlag;
    }

    public void setDelFlag(String delFlag)
    {
        this.delFlag = delFlag;
    }

    public List<String> getSubjectList()
    {
        return subjectList;
    }

    public void setSubjectList(List<String> subjectList)
    {
        this.subjectList = subjectList;
    }

    public String getStudentName()
    {
        return studentName;
    }

    public void setStudentName(String studentName)
    {
        this.studentName = studentName;
    }

    public String getStatusText()
    {
        return statusText;
    }

    public void setStatusText(String statusText)
    {
        this.statusText = statusText;
    }

    public String getSubject()
    {
        return subject;
    }

    public void setSubject(String subject)
    {
        this.subject = subject;
    }

    public String getKeyword()
    {
        return keyword;
    }

    public void setKeyword(String keyword)
    {
        this.keyword = keyword;
    }
}
