package com.tutor.framework.customer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.util.StringUtils;

/**
 * 决定客户邮件用哪种发信方式
 *
 * 判断依据很简单：application.yml 里有没有配 spring.mail.host。
 *   * 配了 -> Spring Boot 会创建 JavaMailSender，这里包成 SmtpCustomerMailSender；
 *   * 没配 -> DevCustomerMailSender（验证码写日志，不真发）。
 *
 * 没有用 @ConditionalOnMissingBean 之类的条件注解：那是给自动配置用的，
 * 在业务 @Configuration 里判断顺序不好保证；这里一个工厂方法直接看环境变量，
 * 行为确定、也好排查。
 *
 * @author 家教中介平台
 */
@Configuration
public class CustomerMailConfig
{
    private static final Logger log = LoggerFactory.getLogger(CustomerMailConfig.class);

    @Value("${spring.mail.username:no-reply@localhost}")
    private String mailUsername;

    /** 可选：发件人显示名 */
    @Value("${customer.mail.from:}")
    private String mailFrom;

    @Bean
    public CustomerMailSender customerMailSender(ObjectProvider<JavaMailSender> mailSenderProvider,
                                                 org.springframework.core.env.Environment env)
    {
        String host = env.getProperty("spring.mail.host");
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (StringUtils.hasText(host) && mailSender != null)
        {
            String from = StringUtils.hasText(mailFrom) ? mailFrom
                    : "家教中介平台 <" + mailUsername + ">";
            log.info("[客户邮件] 使用 SMTP 发信：host={} from={}", host, from);
            return new SmtpCustomerMailSender(mailSender, from);
        }
        log.warn("[客户邮件] 未配置 spring.mail.host，使用开发模式（验证码不会真正发出）");
        return new DevCustomerMailSender();
    }
}
