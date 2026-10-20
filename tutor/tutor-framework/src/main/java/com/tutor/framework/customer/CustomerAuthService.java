package com.tutor.framework.customer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Date;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import com.tutor.common.core.redis.RedisCache;
import com.tutor.common.exception.ServiceException;
import com.tutor.system.domain.CustomerAccount;
import com.tutor.system.service.ICustomerAccountService;

/**
 * 客户账号注册 / 登录
 *
 * 为什么不做手机号 + 短信：平台暂无企业资质，短信通道开不了，
 * 所以用邮箱作为账号标识（邮箱 + 密码）。
 * 邮箱验证码的发送通道留了扩展点：接入 SMTP 后可以在 register 前加一步校验，
 * 目前注册即生效。
 *
 * @author 家教中介平台
 */
@Service
public class CustomerAuthService
{
    /** 邮箱格式 */
    private static final Pattern EMAIL_PATTERN =
            Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    /** 邮箱格式是否合法（注册与「发送验证码」共用同一套规则） */
    /** 邮箱是否已注册（找回密码时用来决定「要不要真发信」，对外不暴露） */
    public boolean emailRegistered(String email)
    {
        String normalized = normalizeEmail(email);
        return isValidEmail(normalized) && customerAccountService.selectByEmail(normalized) != null;
    }

    public static boolean isValidEmail(String email)
    {
        return email != null && EMAIL_PATTERN.matcher(email).matches();
    }

    private static final int PASSWORD_MIN = 6;

    private static final int PASSWORD_MAX = 32;

    private static final Logger log = LoggerFactory.getLogger(CustomerAuthService.class);

    @Autowired
    private ICustomerAccountService customerAccountService;

    @Autowired
    private RedisCache redisCache;

    @Autowired
    private CustomerTokenService customerTokenService;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    @Autowired
    private CustomerVerificationService customerVerificationService;

    /**
     * 注册：邮箱 + 密码 + 邮箱验证码（+ 可选昵称），不选身份
     *
     * 必须先通过邮箱验证码校验 —— 也就是「邮箱得是你能收到的」，
     * 这是本次改动的核心：没有验证码不允许注册。
     */
    public CustomerAccount register(String email, String rawPassword, String nickname, String code)
    {
        String normalized = normalizeEmail(email);
        if (!isValidEmail(normalized))
        {
            throw new ServiceException("邮箱格式不正确", 400);
        }
        if (rawPassword == null || rawPassword.length() < PASSWORD_MIN || rawPassword.length() > PASSWORD_MAX)
        {
            throw new ServiceException("密码长度需在 " + PASSWORD_MIN + "-" + PASSWORD_MAX + " 位之间", 400);
        }
        if (customerAccountService.selectByEmail(normalized) != null)
        {
            throw new ServiceException("该邮箱已被注册", 400);
        }

        // 校验邮箱验证码（一次性，校验通过即作废）
        customerVerificationService.verify(normalized, code);

        CustomerAccount account = new CustomerAccount();
        account.setEmail(normalized);
        account.setPassword(passwordEncoder.encode(rawPassword));
        account.setNickname(nickname == null || nickname.trim().isEmpty()
                ? normalized.substring(0, normalized.indexOf('@'))
                : nickname.trim());
        account.setStatus("0");
        // role 故意留空：注册完成后由客户自己选老师还是学生
        customerAccountService.insertAccount(account);
        return customerAccountService.selectById(account.getAccountId());
    }

    /**
     * 登录：校验邮箱 + 密码
     */
    public CustomerAccount login(String email, String rawPassword)
    {
        String normalized = normalizeEmail(email);
        CustomerAccount account = customerAccountService.selectByEmail(normalized);
        // 邮箱不存在与密码错误返回同一个提示，避免被用来枚举已注册邮箱
        if (account == null || rawPassword == null
                || !passwordEncoder.matches(rawPassword, account.getPassword()))
        {
            throw new ServiceException("邮箱或密码错误", 400);
        }
        if ("1".equals(account.getStatus()))
        {
            throw new ServiceException("该账号已被停用", 400);
        }
        customerAccountService.touchLoginTime(account.getAccountId());
        // 不要把密码哈希带出去
        account.setPassword(null);
        account.setLastLoginTime(new Date());
        return account;
    }

    /**
     * 找回密码：邮箱 + 重置验证码 + 新密码。
     *
     * 与注册分开的两点考虑：
     *   * 验证码用独立 purpose（reset），注册码不能拿来改密码；
     *   * 改完密码把这个账号的所有会话踢掉（Redis 里的客户 token 全删），
     *     否则「密码被盗 → 改密码」这条路线上，攻击者手里的旧 token 还能继续用。
     */
    public CustomerAccount resetPassword(String email, String code, String rawPassword)
    {
        String normalized = normalizeEmail(email);
        if (!isValidEmail(normalized))
        {
            throw new ServiceException("邮箱格式不正确", 400);
        }
        if (rawPassword == null || rawPassword.length() < PASSWORD_MIN || rawPassword.length() > PASSWORD_MAX)
        {
            throw new ServiceException("密码长度需在 " + PASSWORD_MIN + "-" + PASSWORD_MAX + " 位之间", 400);
        }
        CustomerAccount account = customerAccountService.selectByEmail(normalized);
        // 不区分「邮箱没注册」和「验证码错误」？这里必须区分：
        // 走到这一步的用户已经能收到该邮箱的验证码，说明邮箱是本人的；
        // 若账号不存在（比如注册到一半被删），直接给明确提示更有用。
        if (account == null)
        {
            throw new ServiceException("该邮箱还没有注册账号", 400);
        }
        customerVerificationService.verify(normalized, code, CustomerVerificationService.PURPOSE_RESET);

        CustomerAccount update = new CustomerAccount();
        update.setAccountId(account.getAccountId());
        update.setPassword(passwordEncoder.encode(rawPassword));
        customerAccountService.updateAccount(update);

        int kicked = customerAuthSessionKicker(account.getAccountId());
        log.info("[客户账号] 邮箱 {} 重置密码成功，踢下线 {} 个会话", normalized, kicked);

        account.setPassword(null);
        return account;
    }

    /**
     * 把某个账号的所有客户 token 从 Redis 里删掉（改密码 / 停用后调用）。
     *
     * 客户 token 的 key 是 customer_tokens:{uuid}，value 里带 accountId；
     * 量级不大（单机几万人以内），用 keys 扫一遍足够，不值得再维护一张反向索引。
     */
    private int customerAuthSessionKicker(Long accountId)
    {
        if (accountId == null)
        {
            return 0;
        }
        int removed = 0;
        try
        {
            java.util.Collection<String> keys = redisCache.keys("customer_tokens:*");
            if (keys == null)
            {
                return 0;
            }
            for (String key : keys)
            {
                Object session = redisCache.getCacheObject(key);
                if (session instanceof CustomerAccount
                        && accountId.equals(((CustomerAccount) session).getAccountId()))
                {
                    redisCache.deleteObject(key);
                    removed++;
                }
            }
        }
        catch (Exception e)
        {
            log.warn("[客户账号] 清理会话失败（不影响本次改密）：{}", e.getMessage());
        }
        return removed;
    }

    /**
     * 选择身份：老师 / 学生
     */
    public CustomerAccount setRole(Long accountId, String role)
    {
        if (!CustomerAccount.ROLE_TEACHER.equals(role) && !CustomerAccount.ROLE_STUDENT.equals(role))
        {
            throw new ServiceException("身份只能是 TEACHER 或 STUDENT", 400);
        }
        CustomerAccount account = customerAccountService.selectById(accountId);
        if (account == null)
        {
            throw new ServiceException("账号不存在", 400);
        }
        // 身份一次性确定：已选过就不再允许切换（前端也没给入口，这里兜住直接调接口的情况）
        if (account.getRole() != null && !account.getRole().isEmpty())
        {
            if (account.getRole().equals(role))
            {
                account.setPassword(null);
                return account;
            }
            throw new ServiceException("身份已确定为" + ("TEACHER".equals(account.getRole()) ? "老师" : "家长/学生")
                    + "，不支持切换；如需另一种身份请使用其他邮箱注册", 400);
        }
        CustomerAccount update = new CustomerAccount();
        update.setAccountId(accountId);
        update.setRole(role);
        customerAccountService.updateAccount(update);
        account.setRole(role);
        account.setPassword(null);
        return account;
    }

    /** 签发 token */
    public String issueToken(CustomerAccount account)
    {
        CustomerAccount forSession = copyWithoutPassword(account);
        return customerTokenService.createToken(forSession);
    }

    /** 取最新的账号信息（密码不外带），供 /auth/me 用 */
    public CustomerAccount loadAccount(Long accountId)
    {
        CustomerAccount account = customerAccountService.selectById(accountId);
        if (account != null)
        {
            account.setPassword(null);
        }
        return account;
    }

    public void logout(String token)
    {
        customerTokenService.deleteToken(token);
    }

    /** 选完身份后刷新一下会话，避免 Redis 里还是旧角色 */
    public void syncSession(String token, CustomerAccount account)
    {
        customerTokenService.refreshSession(token, copyWithoutPassword(account));
    }

    private CustomerAccount copyWithoutPassword(CustomerAccount account)
    {
        CustomerAccount copy = new CustomerAccount();
        copy.setAccountId(account.getAccountId());
        copy.setEmail(account.getEmail());
        copy.setNickname(account.getNickname());
        copy.setRole(account.getRole());
        copy.setStatus(account.getStatus());
        copy.setCreateTime(account.getCreateTime());
        copy.setLastLoginTime(account.getLastLoginTime());
        return copy;
    }

    private String normalizeEmail(String email)
    {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
