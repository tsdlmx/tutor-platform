package com.tutor.framework.customer;

import com.tutor.system.domain.CustomerAccount;

/**
 * 当前请求的客户上下文
 *
 * 由 CustomerAuthInterceptor 在请求进入时写入、请求结束时清理。
 * 用 ThreadLocal 而不是 SecurityContext：客户体系与若依的管理后台鉴权
 * 完全隔离，不希望在 Spring Security 里留下一个"半认证"的身份。
 *
 * @author 家教中介平台
 */
public final class CustomerContext
{
    private static final ThreadLocal<CustomerAccount> HOLDER = new ThreadLocal<>();

    private CustomerContext()
    {
    }

    public static void set(CustomerAccount account)
    {
        HOLDER.set(account);
    }

    /** 可能为 null（未登录） */
    public static CustomerAccount get()
    {
        return HOLDER.get();
    }

    /** 取当前账号ID；未登录返回 null */
    public static Long getAccountId()
    {
        CustomerAccount account = HOLDER.get();
        return account == null ? null : account.getAccountId();
    }

    public static void clear()
    {
        HOLDER.remove();
    }
}
