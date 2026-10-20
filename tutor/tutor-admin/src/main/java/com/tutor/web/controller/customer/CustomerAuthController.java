package com.tutor.web.controller.customer;

import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import com.tutor.common.core.controller.BaseController;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.framework.customer.CustomerAuthInterceptor;
import com.tutor.framework.customer.CustomerAuthService;
import com.tutor.framework.customer.CustomerContext;
import com.tutor.framework.customer.CustomerRateLimiter;
import com.tutor.framework.customer.CustomerVerificationService;
import com.tutor.system.domain.CustomerAccount;

import javax.servlet.http.HttpServletRequest;

/**
 * 客户账号：邮箱注册 / 登录 / 选择身份
 *
 * 面向的是平台客户（老师 / 学生），不是管理后台用户。
 * 用邮箱而不是手机号：平台暂无企业资质，短信通道开不了。
 *
 * @author 家教中介平台
 */
@RestController
@RequestMapping("/customer")
public class CustomerAuthController extends BaseController
{
    @Autowired
    private CustomerAuthService customerAuthService;

    @Autowired
    private CustomerVerificationService customerVerificationService;

    @Autowired
    private CustomerRateLimiter customerRateLimiter;

    /** 同一 IP 每分钟最多请求几次验证码（防「换着邮箱刷」烧发信额度） */
    @Value("${customer.ratelimit.send-code-per-minute:15}")
    private int sendCodePerMinute;

    /** 同一 IP 每小时最多请求几次验证码 */
    @Value("${customer.ratelimit.send-code-per-hour:100}")
    private int sendCodePerHour;

    /** 同一 IP 每小时最多注册几次 */
    @Value("${customer.ratelimit.register-per-hour:20}")
    private int registerPerHour;

    /** 同一 IP + 邮箱 10 分钟内最多登录尝试几次 */
    @Value("${customer.ratelimit.login-per-10min:20}")
    private int loginPer10Min;

    /**
     * 发送邮箱验证码 —— 注册前必须先完成这一步
     *
     * 限流：同邮箱 60 秒一次、每小时 10 次；验证码 5 分钟有效、一次性使用。
     * 没有配置 SMTP 时走开发模式：验证码写后台日志，并随响应回显（devCode）。
     */
    @PostMapping("/auth/send-code")
    public AjaxResult sendCode(@RequestBody CustomerAccount body, HttpServletRequest request)
    {
        String ip = customerRateLimiter.clientIp(request);
        customerRateLimiter.check("send-code", ip + ":m", sendCodePerMinute, 60);
        customerRateLimiter.check("send-code", ip + ":h", sendCodePerHour, 3600);
        return AjaxResult.success("验证码已发送",
                customerVerificationService.sendCode(body.getEmail()));
    }

    /**
     * 找回密码第 1 步：给已注册邮箱发重置验证码。
     *
     * 账号不存在时**也返回成功**（不发信），避免这个接口被用来枚举「哪些邮箱注册过」。
     * 前端文案统一为「如果该邮箱已注册，验证码已发送」。
     */
    @PostMapping("/auth/send-reset-code")
    public AjaxResult sendResetCode(@RequestBody CustomerAccount body, HttpServletRequest request)
    {
        String ip = customerRateLimiter.clientIp(request);
        customerRateLimiter.check("send-reset-code", ip + ":m", sendCodePerMinute, 60);
        customerRateLimiter.check("send-reset-code", ip + ":h", sendCodePerHour, 3600);
        Map<String, Object> data = customerVerificationService.sendResetCode(
                body.getEmail(), customerAuthService.emailRegistered(body.getEmail()));
        Map<String, Object> payload = data == null ? new java.util.LinkedHashMap<>() : data;
        payload.putIfAbsent("sent", true);
        payload.putIfAbsent("expiresIn", 300);
        payload.putIfAbsent("resendAfter", 60);
        return AjaxResult.success("如果该邮箱已注册，验证码已发送", payload);
    }

    /**
     * 找回密码第 2 步：邮箱 + 重置验证码 + 新密码。
     * 成功后该账号的所有旧会话都会失效，需要用新密码重新登录。
     */
    @PostMapping("/auth/reset-password")
    public AjaxResult resetPassword(@RequestBody Map<String, String> body, HttpServletRequest request)
    {
        String ip = customerRateLimiter.clientIp(request);
        // 防止拿「改密码」接口暴力猜 6 位验证码：按 IP + 邮箱限制
        customerRateLimiter.check("reset-password",
                ip + ":" + (body.get("email") == null ? "-" : body.get("email").trim().toLowerCase()),
                10, 600);
        customerAuthService.resetPassword(body.get("email"), body.get("code"), body.get("password"));
        return AjaxResult.success("密码已重置，请用新密码登录");
    }

    /**
     * 注册：邮箱 + 密码 + 邮箱验证码（+ 可选昵称）
     *
     * 邮箱必须先通过验证码验证（证明这个邮箱是你能收到的），
     * 注册时**不选身份**，注册完成后由客户自己选老师还是学生。
     */
    @PostMapping("/auth/register")
    public AjaxResult register(@RequestBody CustomerAccount body, HttpServletRequest request)
    {
        String ip = customerRateLimiter.clientIp(request);
        customerRateLimiter.check("register", ip, registerPerHour, 3600);
        CustomerAccount account = customerAuthService.register(
                body.getEmail(), body.getPassword(), body.getNickname(), body.getCode());
        String token = customerAuthService.issueToken(account);
        return AjaxResult.success("注册成功", tokenPayload(token, account));
    }

    /**
     * 登录
     */
    @PostMapping("/auth/login")
    public AjaxResult login(@RequestBody CustomerAccount body, HttpServletRequest request)
    {
        String ip = customerRateLimiter.clientIp(request);
        String emailKey = body.getEmail() == null ? "-" : body.getEmail().trim().toLowerCase();
        // 按「IP + 邮箱」限流：同一出口 IP 下多个用户互不影响，同时挡住对单账号的暴力破解
        customerRateLimiter.check("login", ip + ":" + emailKey, loginPer10Min, 600);
        CustomerAccount account = customerAuthService.login(body.getEmail(), body.getPassword());
        String token = customerAuthService.issueToken(account);
        return AjaxResult.success("登录成功", tokenPayload(token, account));
    }

    /**
     * 当前登录账号（前端用它判断是否要跳去选身份）
     */
    @GetMapping("/auth/me")
    public AjaxResult me()
    {
        CustomerAccount account = CustomerContext.get();
        if (account == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        // 从库里取最新的，避免角色/昵称改过之后这里还是旧值
        CustomerAccount fresh = loadFresh(account.getAccountId());
        return AjaxResult.success(fresh);
    }

    /**
     * 选择身份：老师 / 学生
     */
    @PutMapping("/auth/role")
    public AjaxResult setRole(@RequestBody Map<String, String> body, HttpServletRequest request)
    {
        Long accountId = CustomerContext.getAccountId();
        if (accountId == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        CustomerAccount account = customerAuthService.setRole(accountId, body.get("role"));
        // 会话里的角色要同步，否则后续请求拿到的还是旧角色
        customerAuthService.syncSession(CustomerAuthInterceptor.resolveToken(request), account);
        return AjaxResult.success("身份已设置", account);
    }

    /**
     * 退出登录（删掉 Redis 会话，token 立即失效）
     */
    @PostMapping("/auth/logout")
    public AjaxResult logout(HttpServletRequest request)
    {
        customerAuthService.logout(CustomerAuthInterceptor.resolveToken(request));
        return AjaxResult.success("已退出登录");
    }

    /**
     * 科目字典：给「发布需求」的科目多选用
     * 表里没有独立科目表，这里给一份与演示数据一致的清单。
     */
    @GetMapping("/subjects")
    public AjaxResult subjects()
    {
        return AjaxResult.success(new String[] {
                "语文", "数学", "英语", "物理", "化学", "生物",
                "历史", "地理", "政治", "科学", "信息技术", "奥数", "陪读"
        });
    }

    private CustomerAccount loadFresh(Long accountId)
    {
        CustomerAccount fresh = customerAuthService.loadAccount(accountId);
        return fresh == null ? CustomerContext.get() : fresh;
    }

    private Map<String, Object> tokenPayload(String token, CustomerAccount account)
    {
        Map<String, Object> payload = new java.util.LinkedHashMap<>(4);
        payload.put("token", token);
        payload.put("account", account);
        return payload;
    }
}
