package com.tutor.framework.customer;

import javax.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;

/**
 * 真发信：走 SMTP（spring.mail.* 配置）
 *
 * 本机实测出站 465 端口可达，所以拿到任意邮箱服务商的「授权码」之后
 * 填进 application.yml 就能直接发信，不用改代码。
 *
 * @author 家教中介平台
 */
public class SmtpCustomerMailSender implements CustomerMailSender
{
    private static final Logger log = LoggerFactory.getLogger(SmtpCustomerMailSender.class);

    private final JavaMailSender mailSender;

    /** 发件人（一般与 spring.mail.username 相同） */
    private final String from;

    public SmtpCustomerMailSender(JavaMailSender mailSender, String from)
    {
        this.mailSender = mailSender;
        this.from = from;
    }

    @Override
    public void sendVerificationCode(String email, String code, int expireSeconds) throws Exception
    {
        MimeMessage message = mailSender.createMimeMessage();
        // true = multipart，方便以后加纯文本副本
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(from);
        helper.setTo(email);
        helper.setSubject("【家教中介平台】邮箱验证码：" + code);
        helper.setText(buildHtml(code, expireSeconds), true);
        mailSender.send(message);
        log.info("[客户邮件] 验证码已发送至 {}（{} 秒内有效）", mask(email), expireSeconds);
    }

    @Override
    public boolean isRealTransport()
    {
        return true;
    }

    @Override
    public String describe()
    {
        return "SMTP(" + from + ")";
    }

    /** 邮件正文：尽量简单，别进垃圾箱 */
    private String buildHtml(String code, int expireSeconds)
    {
        int minutes = Math.max(1, expireSeconds / 60);
        return "<div style=\"font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;"
                + "font-size:14px;color:#27272a;line-height:1.7\">"
                + "<p>你好，</p>"
                + "<p>你正在注册「家教中介平台」，本次邮箱验证码是：</p>"
                + "<p style=\"font-size:28px;font-weight:700;letter-spacing:6px;color:#0ea5e9;margin:16px 0\">"
                + code + "</p>"
                + "<p>验证码 " + minutes + " 分钟内有效，请勿转发给他人。</p>"
                + "<p style=\"color:#71717a;font-size:12px\">如果这不是你本人的操作，忽略本邮件即可，"
                + "你的邮箱不会被注册。</p>"
                + "</div>";
    }

    /** 日志里不打全量邮箱 */
    private String mask(String email)
    {
        if (email == null || email.indexOf('@') < 0)
        {
            return "***";
        }
        int at = email.indexOf('@');
        String name = email.substring(0, at);
        String head = name.length() <= 2 ? name.substring(0, 1) : name.substring(0, 2);
        return head + "***" + email.substring(at);
    }
}
