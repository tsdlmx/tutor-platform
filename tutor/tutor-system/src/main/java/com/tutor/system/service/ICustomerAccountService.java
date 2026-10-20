package com.tutor.system.service;

import java.util.List;
import com.tutor.system.domain.CustomerAccount;

/**
 * 客户账号 Service（纯数据访问，注册/登录的编排在 framework 层的 CustomerAuthService）
 *
 * @author 家教中介平台
 */
public interface ICustomerAccountService
{
    /** 按邮箱查（登录/查重用） */
    CustomerAccount selectByEmail(String email);

    /** 按ID查 */
    CustomerAccount selectById(Long accountId);

    /** 新增账号（password 需已加密） */
    int insertAccount(CustomerAccount account);

    /** 更新账号 */
    int updateAccount(CustomerAccount account);

    /** 刷新最后登录时间 */
    int touchLoginTime(Long accountId);

    /** 按ID批量取（用于需求列表展示学生名） */
    List<CustomerAccount> selectByIds(List<Long> ids);

    /** 管理后台：按条件查询客户账号（老师 / 学生） */
    List<CustomerAccount> selectAccountList(CustomerAccount query);
}
