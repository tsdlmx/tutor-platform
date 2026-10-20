package com.tutor.system.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import com.tutor.system.domain.CustomerAccount;

/**
 * 客户账号 Mapper
 *
 * @author 家教中介平台
 */
public interface CustomerAccountMapper
{
    /** 按邮箱查（登录 / 注册查重） */
    CustomerAccount selectByEmail(@Param("email") String email);

    /** 按ID查 */
    CustomerAccount selectById(@Param("accountId") Long accountId);

    /**
     * 管理后台用：按条件分页查询客户账号（老师 / 学生）
     * 分页由 PageHelper 负责，这里只写 where
     */
    List<CustomerAccount> selectAccountList(CustomerAccount query);

    /** 新增 */
    int insertAccount(CustomerAccount account);

    /** 更新身份 / 昵称 / 最后登录时间 */
    int updateAccount(CustomerAccount account);

    /** 按ID批量取昵称（需求列表展示学生名用） */
    List<CustomerAccount> selectByIds(@Param("ids") List<Long> ids);
}
