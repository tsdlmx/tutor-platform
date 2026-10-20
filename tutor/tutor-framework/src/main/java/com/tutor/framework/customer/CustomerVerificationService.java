package com.tutor.framework.customer;

import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.tutor.common.core.redis.RedisCache;
import com.tutor.common.exception.ServiceException;

/**
 * 邮箱验证码：生成、发送、校验
 *
 * 规则（都可配）：
 *   * 验证码 6 位纯数字，5 分钟有效；
 *   * 同一邮箱 60 秒内只能发一次；
 *   * 同一邮箱每小时最多 10 次；
 *   * 校验失败超过 5 次就作废该验证码（防爆破）；
 *   * 校验成功后立刻删除，**一次性使用**。
 *
 * 存储用 Redis（RedisCache），key 前缀 customer:emailcode:*，
 * 与后台的缓存互不干扰。
 *
 * @author 家教中介平台
 */
@Service
public class CustomerVerificationService
{
    private static final Logger log = LoggerFactory.getLogger(CustomerVerificationService.class);

    /**
     * 验证码用途：注册 / 找回密码。
     * 两者的 Redis key 前缀不同，注册拿到的验证码不能用来重置密码（反之亦然）。
     */
    public static final String PURPOSE_REGISTER = "reg";
    public static final String PURPOSE_RESET = "reset";

    /** 验证码本身（后面再接 purpose，见 keyOf） */
    private static final String CODE_KEY = "customer:emailcode:";

    /** 发送频率限制（60 秒） */
    private static final String THROTTLE_KEY = "customer:emailcode:throttle:";

    /** 每小时发送次数 */
    private static final String COUNT_KEY = "customer:emailcode:count:";

    /** 校验失败次数 */
    private static final String TRY_KEY = "customer:emailcode:try:";

    private static final SecureRandom RANDOM = new SecureRandom();

    @Value("${customer.mail.code-expire-seconds:300}")
    private int expireSeconds;

    @Value("${customer.mail.resend-interval-seconds:60}")
    private int resendIntervalSeconds;

    @Value("${customer.mail.hourly-limit:10}")
    private int hourlyLimit;

    @Value("${customer.mail.max-verify-attempts:5}")
    private int maxVerifyAttempts;

    /** 开发模式：没有 SMTP 时把验证码回给前端，方便联调；上线必须关掉 */
    @Value("${customer.mail.dev-mode:false}")
    private boolean devMode;

    /**
     * 测试回声：仅对白名单测试域名（默认 example.com 这类收不到信、也不可能是真实用户的域）
     * 跳过发信并回显验证码，供自动化测试注册账号用。默认关闭。
     */
    @Value("${customer.mail.test-echo:false}")
    private boolean testEcho;

    @Value("${customer.mail.test-echo-domains:example.com,demo.com,test.local}")
    private String testEchoDomains;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private CustomerMailSender mailSender;

    /**
     * 发验证码
     *
     * @return 给前端的信息（有效期；开发模式下额外带 devCode）
     */
    public Map<String, Object> sendCode(String rawEmail)
    {
        return send(rawEmail, PURPOSE_REGISTER);
    }

    /**
     * 找回密码：发重置验证码。
     *
     * 账号不存在时**不报错**（避免被用来枚举哪些邮箱注册过），由调用方决定返回什么文案。
     *
     * @param accountExists 账号是否真实存在；false 时只做参数校验，不发信、不写 Redis
     */
    public Map<String, Object> sendResetCode(String rawEmail, boolean accountExists)
    {
        if (!accountExists)
        {
            log.info("[客户邮件] 重置验证码请求的邮箱未注册，静默忽略");
            return null;
        }
        return send(rawEmail, PURPOSE_RESET);
    }

    private Map<String, Object> send(String rawEmail, String purpose)
    {
        String email = normalize(rawEmail);
        if (!CustomerAuthService.isValidEmail(email))
        {
            throw new ServiceException("邮箱格式不正确", 400);
        }

        String kCode = CODE_KEY + purpose + ":" + email;
        String kThrottle = THROTTLE_KEY + purpose + ":" + email;
        String kCount = COUNT_KEY + purpose + ":" + email;
        String kTry = TRY_KEY + purpose + ":" + email;

        // 60 秒内不许重复发
        if (redisCache.hasKey(kThrottle))
        {
            throw new ServiceException("验证码已发送，请 " + resendIntervalSeconds + " 秒后再试", 400);
        }
        // 每小时次数上限
        Object sent = redisCache.getCacheObject(kCount);
        int sentCount = sent == null ? 0 : Integer.parseInt(String.valueOf(sent));
        if (sentCount >= hourlyLimit)
        {
            throw new ServiceException("该邮箱发送次数过多，请稍后再试", 400);
        }

        String code = randomCode();
        boolean echoOnly = testEcho && isEchoDomain(email);
        try
        {
            if (echoOnly)
            {
                log.info("[客户邮件] test-echo 开启且域名为测试域，跳过真实发信：{}", email);
            }
            else
            {
                mailSender.sendVerificationCode(email, code, expireSeconds);
            }
        }
        catch (Exception e)
        {
            // 发信失败就不要把验证码留在 Redis 里，否则用户拿不到码却占着额度
            log.error("[客户邮件] 验证码发送失败：{}", e.getMessage(), e);
            throw new ServiceException("验证码发送失败，请稍后重试", 400);
        }

        redisCache.setCacheObject(kCode, code, expireSeconds, TimeUnit.SECONDS);
        redisCache.deleteObject(kTry);
        redisCache.setCacheObject(kThrottle, 1, resendIntervalSeconds, TimeUnit.SECONDS);
        redisCache.setCacheObject(kCount, sentCount + 1, 60, TimeUnit.MINUTES);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sent", true);
        result.put("expiresIn", expireSeconds);
        result.put("resendAfter", resendIntervalSeconds);
        result.put("transport", echoOnly ? "test-echo(未发信)" : mailSender.describe());
        if (echoOnly)
        {
            // 自动化测试专用：只对白名单测试域生效，真实邮箱不会走到这里
            result.put("devCode", code);
            result.put("devNotice", "test-echo 模式：当前邮箱域属于测试域，验证码未真实发送");
        }
        else if (devMode && !mailSender.isRealTransport())
        {
            // 只有「开发模式 + 确实没在真发信」两个条件同时满足才回显，
            // 避免哪天误开发模式把真实验证码泄漏给调用方
            result.put("devCode", code);
            result.put("devNotice", "当前未配置 SMTP，验证码由后台日志输出并在此回显，仅供本地联调");
        }
        return result;
    }

    /** 邮箱域是否属于「收不到信」的测试域名白名单 */
    private boolean isEchoDomain(String email)
    {
        int at = email.lastIndexOf('@');
        if (at < 0) return false;
        String domain = email.substring(at + 1).trim().toLowerCase();
        for (String allowed : testEchoDomains.split(","))
        {
            if (domain.equals(allowed.trim().toLowerCase()))
            {
                return true;
            }
        }
        return false;
    }

    /**
     * 校验验证码（注册前调用）。校验通过即消费掉，不能重复使用。
     */
    public void verify(String rawEmail, String code)
    {
        verify(rawEmail, code, PURPOSE_REGISTER);
    }

    /** 按用途校验验证码（注册码不能用于重置，反之亦然） */
    public void verify(String rawEmail, String code, String purpose)
    {
        String email = normalize(rawEmail);
        if (code == null || code.trim().isEmpty())
        {
            throw new ServiceException("请填写邮箱验证码", 400);
        }
        String key = CODE_KEY + purpose + ":" + email;
        String tryKey = TRY_KEY + purpose + ":" + email;
        Object cached = redisCache.getCacheObject(key);
        if (cached == null)
        {
            throw new ServiceException("验证码已过期，请重新获取", 400);
        }

        // 失败次数限制，防止 6 位码被爆破
        Object tries = redisCache.getCacheObject(tryKey);
        int tried = tries == null ? 0 : Integer.parseInt(String.valueOf(tries));
        if (tried >= maxVerifyAttempts)
        {
            redisCache.deleteObject(key);
            throw new ServiceException("验证码错误次数过多，请重新获取", 400);
        }

        if (!String.valueOf(cached).equals(code.trim()))
        {
            redisCache.setCacheObject(tryKey, tried + 1,
                    Math.max(expireSeconds, 60), TimeUnit.SECONDS);
            throw new ServiceException("验证码不正确", 400);
        }

        // 一次性使用
        redisCache.deleteObject(key);
        redisCache.deleteObject(TRY_KEY + email);
    }

    /** 当前发信方式（给「发送验证码」接口回显，也方便排障） */
    public String describeTransport()
    {
        return mailSender.describe();
    }

    private String randomCode()
    {
        // 6 位，首位可以是 0，所以用左补零
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    private String normalize(String email)
    {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
