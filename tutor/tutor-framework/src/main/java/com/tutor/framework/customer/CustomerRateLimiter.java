package com.tutor.framework.customer;

import java.util.concurrent.TimeUnit;
import javax.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.tutor.common.core.redis.RedisCache;
import com.tutor.common.exception.ServiceException;

/**
 * 客户侧接口的按 IP 限流（Redis 计数）。
 *
 * 为什么要有它：
 *   * 验证码接口是按「邮箱」限流的（60 秒一次、每小时 10 次），但攻击者可以换着邮箱刷，
 *     一天下来能烧掉几百封发信额度、把发件域打成垃圾邮件来源；
 *   * 登录接口没有 IP 维度限制，暴力破解只受若依自己的账号锁定约束。
 * 所以这里补一层「同 IP 单位时间最多 N 次」。
 *
 * 实现要点：
 *   * 计数用 Redis 的 INCR（原子），第一次自增时设置过期；
 *   * 限流粒度是 (scope, key)，key 一般是 IP；登录用「IP+邮箱」避免同一出口 IP
 *     后面挂多个用户时互相影响；
 *   * 关闭开关（customer.ratelimit.enabled=false）时直接放行，方便压测和跑测试。
 */
@Component
public class CustomerRateLimiter
{
    private static final Logger log = LoggerFactory.getLogger(CustomerRateLimiter.class);

    private static final String KEY_PREFIX = "customer:ratelimit:";

    /** 本机回环：说明请求来自前端代理（vite preview 的 proxy） */
    private static final String LOOPBACK_V4 = "127.0.0.1";
    private static final String LOOPBACK_V6 = "::1";

    @Value("${customer.ratelimit.enabled:true}")
    private boolean enabled;

    @Autowired
    private RedisCache redisCache;

    /**
     * 判断请求是否超限，超限直接抛 400（前端 toast 展示）。
     *
     * @param scope    接口名，如 send-code
     * @param key      限流主体，一般是 IP（登录用 IP+邮箱）
     * @param max      窗口内允许的最大次数
     * @param seconds  窗口长度（秒）
     */
    public void check(String scope, String key, int max, int seconds)
    {
        if (!enabled || max <= 0)
        {
            return;
        }
        String redisKey = KEY_PREFIX + scope + ":" + key;
        try
        {
            Long count = redisCache.redisTemplate.opsForValue().increment(redisKey);
            if (count != null && count == 1L)
            {
                redisCache.expire(redisKey, seconds, TimeUnit.SECONDS);
            }
            if (count != null && count > max)
            {
                log.warn("[客户限流] scope={} key={} 已达 {} 次/{} 秒", scope, key, count, seconds);
                throw new ServiceException("操作过于频繁，请 " + humanWindow(seconds) + "后再试", 429);
            }
        }
        catch (ServiceException e)
        {
            throw e;
        }
        catch (Exception e)
        {
            // Redis 出问题时不能把正常用户挡在外面：记录后放行
            log.error("[客户限流] 计数失败，已放行：{}", e.getMessage());
        }
    }

    /**
     * 解析真实客户端 IP。
     *
     * 安全要点：只有「直连方是本机回环」（也就是前端 Vite 代理）时才相信
     * X-Forwarded-For —— 否则攻击者自己伪造一个 XFF 头就能绕过限流。
     * 后端 12501 目前还对公网开放，这条判断必须留着。
     */
    public String clientIp(HttpServletRequest request)
    {
        String remote = request == null ? null : request.getRemoteAddr();
        if (remote != null && (LOOPBACK_V4.equals(remote) || LOOPBACK_V6.equals(remote)))
        {
            String xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.trim().isEmpty() && !"unknown".equalsIgnoreCase(xff))
            {
                // XFF 可能是 a, b, c：最左边的是最初发起方
                String first = xff.split(",")[0].trim();
                if (!first.isEmpty())
                {
                    return first;
                }
            }
        }
        return remote == null ? "unknown" : remote;
    }

    private String humanWindow(int seconds)
    {
        if (seconds % 3600 == 0)
        {
            return (seconds / 3600) + " 小时";
        }
        if (seconds % 60 == 0)
        {
            return (seconds / 60) + " 分钟";
        }
        return seconds + " 秒";
    }
}
