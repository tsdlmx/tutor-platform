package com.tutor.system.domain;

import java.math.BigDecimal;
import java.util.List;
import com.tutor.common.core.domain.BaseEntity;

/**
 * 老师个人简历（与客户账号 1:1）
 *
 * 「我的」页面里老师填的那份简历，会展示在自己的个人主页上。
 *
 * @author 家教中介平台
 */
public class TeacherProfile extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 账号ID（同时也是主键） */
    private Long accountId;

    /** 真实姓名 */
    private String realName;

    /** 性别 0未知 1男 2女 */
    private String gender;

    /** 年龄 */
    private Integer age;

    /** 所在城市 */
    private String city;

    /** 学历 */
    private String education;

    /** 毕业院校 */
    private String school;

    /** 专业 */
    private String major;

    /** 可授科目，逗号分隔（存库形态） */
    private String subjects;

    /** 可授年级，逗号分隔 */
    private String grades;

    /** 期望时薪 */
    private BigDecimal hourlyRate;

    /** 教龄（年） */
    private Integer experienceYears;

    /** 可授课时间 */
    private String availableTime;

    /** 自我介绍 / 教学风格 */
    private String intro;

    /** 证书与荣誉 */
    private String certificates;

    /** 联系方式 */
    private String contact;

    /** 前端传入的科目数组（写入时拼成 subjects） */
    private List<String> subjectList;

    public Long getAccountId()
    {
        return accountId;
    }

    public void setAccountId(Long accountId)
    {
        this.accountId = accountId;
    }

    public String getRealName()
    {
        return realName;
    }

    public void setRealName(String realName)
    {
        this.realName = realName;
    }

    public String getGender()
    {
        return gender;
    }

    public void setGender(String gender)
    {
        this.gender = gender;
    }

    public Integer getAge()
    {
        return age;
    }

    public void setAge(Integer age)
    {
        this.age = age;
    }

    public String getCity()
    {
        return city;
    }

    public void setCity(String city)
    {
        this.city = city;
    }

    public String getEducation()
    {
        return education;
    }

    public void setEducation(String education)
    {
        this.education = education;
    }

    public String getSchool()
    {
        return school;
    }

    public void setSchool(String school)
    {
        this.school = school;
    }

    public String getMajor()
    {
        return major;
    }

    public void setMajor(String major)
    {
        this.major = major;
    }

    public String getSubjects()
    {
        return subjects;
    }

    public void setSubjects(String subjects)
    {
        this.subjects = subjects;
    }

    public String getGrades()
    {
        return grades;
    }

    public void setGrades(String grades)
    {
        this.grades = grades;
    }

    public BigDecimal getHourlyRate()
    {
        return hourlyRate;
    }

    public void setHourlyRate(BigDecimal hourlyRate)
    {
        this.hourlyRate = hourlyRate;
    }

    public Integer getExperienceYears()
    {
        return experienceYears;
    }

    public void setExperienceYears(Integer experienceYears)
    {
        this.experienceYears = experienceYears;
    }

    public String getAvailableTime()
    {
        return availableTime;
    }

    public void setAvailableTime(String availableTime)
    {
        this.availableTime = availableTime;
    }

    public String getIntro()
    {
        return intro;
    }

    public void setIntro(String intro)
    {
        this.intro = intro;
    }

    public String getCertificates()
    {
        return certificates;
    }

    public void setCertificates(String certificates)
    {
        this.certificates = certificates;
    }

    public String getContact()
    {
        return contact;
    }

    public void setContact(String contact)
    {
        this.contact = contact;
    }

    public List<String> getSubjectList()
    {
        return subjectList;
    }

    public void setSubjectList(List<String> subjectList)
    {
        this.subjectList = subjectList;
    }
}
