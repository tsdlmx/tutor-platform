package com.tutor.framework.customer;

/**
 * 客户邮件发送（目前只有一件事：发注册验证码）
 *
 * 做成接口是为了把「发信方式」和「验证码业务」解耦：
 *   * 配了 SMTP  -> SmtpCustomerMailSender，真的发邮件；
 *   * 没配 SMTP  -> DevCustomerMailSender，只写日志（并把验证码回给前端，仅开发模式）。
 * 本机没有企业邮箱/发信凭据，所以默认落在开发模式；拿到 SMTP 账号后
 * 只要在 application.yml 里填 spring.mail.* 就会自动切到真发信。
 *
 * @author 家教中介平台
 */
public interface CustomerMailSender
{
    /**
     * 发送邮箱验证码
     *
     * @param email         收件邮箱
     * @param code          验证码
     * @param expireSeconds 有效期（秒），写进邮件正文
     */
    void sendVerificationCode(String email, String code, int expireSeconds) throws Exception;

    /** 是否是真发信（false = 开发模式） */
    boolean isRealTransport();

    /** 发信方式描述，用于日志与排障 */
    String describe();
}
