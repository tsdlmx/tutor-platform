package com.tutor.framework.customer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 开发模式的「发信」：不真发，把验证码写进日志
 *
 * 什么时候用它：没有 SMTP 账号（本机就是这种情况），
 * 但又要把「注册必须先验证邮箱」这条流程完整跑通、可测。
 *
 * 安全边界：
 *   * 只有配置 customer.mail.dev-mode=true 时，验证码才会随接口响应返回；
 *   * 关掉 dev-mode 又没配 SMTP，注册会因为收不到验证码而直接失败（fail closed，
 *     不会静默放行），日志里会明确提示还没配 SMTP。
 *
 * @author 家教中介平台
 */
public class DevCustomerMailSender implements CustomerMailSender
{
    private static final Logger log = LoggerFactory.getLogger(DevCustomerMailSender.class);

    @Override
    public void sendVerificationCode(String email, String code, int expireSeconds)
    {
        log.warn("\n" +
                "┌──────────────────────────────────────────────────────────────┐\n" +
                "│  开发模式（未配置 SMTP）：邮箱验证码没有真的发出去            │\n" +
                "│  收件人 : {}\n" +
                "│  验证码 : {}\n" +
                "│  有效期 : {} 秒\n" +
                "│  要真发邮件：在 application.yml 里配置 spring.mail.* 并把      │\n" +
                "│  customer.mail.dev-mode 设为 false                            │\n" +
                "└──────────────────────────────────────────────────────────────┘",
                email, code, expireSeconds);
    }

    @Override
    public boolean isRealTransport()
    {
        return false;
    }

    @Override
    public String describe()
    {
        return "开发模式（验证码写日志，未真正发信）";
    }
}
