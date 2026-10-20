package com.tutor.system.domain;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.tutor.common.core.domain.BaseEntity;

/**
 * 客户账号（邮箱注册）
 *
 * 与若依的 SysUser 完全隔离：客户账号不在 sys_user 里，
 * 所以客户 token 不可能通过管理后台的鉴权。
 *
 * @author 家教中介平台
 */
public class CustomerAccount extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 老师身份 */
    public static final String ROLE_TEACHER = "TEACHER";

    /** 学生身份 */
    public static final String ROLE_STUDENT = "STUDENT";

    /** 账号ID */
    private Long accountId;

    /** 邮箱（登录名） */
    private String email;

    /**
     * BCrypt 密码哈希
     * WRITE_ONLY：只允许从请求写进来，永远不会被序列化给前端
     */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password;

    /** 昵称 */
    private String nickname;

    /** 身份 TEACHER / STUDENT，null 表示注册后还没选择 */
    private String role;

    /** 状态 0正常 1停用 */
    private String status;

    /** 最后登录时间 */
    private java.util.Date lastLoginTime;

    /**
     * 注册时提交的邮箱验证码 —— 只用于入参，不落库、不返回
     * （和 StudentDemand 的 subjectList 一样，属于「随对象传递的临时字段」）
     */
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String code;

    /** 判断是否已经选过身份 */
    public boolean hasRole()
    {
        return ROLE_TEACHER.equals(role) || ROLE_STUDENT.equals(role);
    }

    public Long getAccountId()
    {
        return accountId;
    }

    public void setAccountId(Long accountId)
    {
        this.accountId = accountId;
    }

    public String getEmail()
    {
        return email;
    }

    public void setEmail(String email)
    {
        this.email = email;
    }

    public String getPassword()
    {
        return password;
    }

    public void setPassword(String password)
    {
        this.password = password;
    }

    public String getNickname()
    {
        return nickname;
    }

    public void setNickname(String nickname)
    {
        this.nickname = nickname;
    }

    public String getRole()
    {
        return role;
    }

    public void setRole(String role)
    {
        this.role = role;
    }

    public String getStatus()
    {
        return status;
    }

    public void setStatus(String status)
    {
        this.status = status;
    }

    public String getCode()
    {
        return code;
    }

    public void setCode(String code)
    {
        this.code = code;
    }

    public java.util.Date getLastLoginTime()
    {
        return lastLoginTime;
    }

    public void setLastLoginTime(java.util.Date lastLoginTime)
    {
        this.lastLoginTime = lastLoginTime;
    }
}
