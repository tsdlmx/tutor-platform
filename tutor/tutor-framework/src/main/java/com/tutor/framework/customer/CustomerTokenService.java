package com.tutor.framework.customer;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import com.tutor.common.core.redis.RedisCache;
import com.tutor.system.domain.CustomerAccount;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;

/**
 * 客户 token 服务（与若依管理后台的 TokenService 各管各的）
 *
 * 设计要点：
 *   * Redis key 前缀独立（customer_tokens:），所以客户的 token 不可能被
 *     管理后台的 JwtAuthenticationTokenFilter 认出来，反之亦然；
 *   * JWT 里只放 accountId 和一个随机 uuid，真正的账号信息在 Redis 里，
 *     因此可以随时踢下线（退出登录 = 删 key）；
 *   * 剩余有效期不足 20 分钟时自动续期，避免用户用着用着被登出。
 *
 * @author 家教中介平台
 */
@Component
public class CustomerTokenService
{
    /** Redis 里客户 token 的 key 前缀 */
    private static final String CUSTOMER_TOKEN_KEY = "customer_tokens:";

    /** 剩余不足 20 分钟就续期 */
    private static final long REFRESH_THRESHOLD_MILLIS = 20 * 60 * 1000L;

    /** 复用若依的密钥配置（jwt 签名密钥，见 application.yml 的 token.secret） */
    @Value("${token.secret}")
    private String secret;

    /** 有效期（分钟） */
    @Value("${token.expireTime:1440}")
    private int expireTime;

    @Autowired
    private RedisCache redisCache;

    /**
     * 签发 token 并写入 Redis 会话
     */
    public String createToken(CustomerAccount account)
    {
        String uuid = UUID.randomUUID().toString().replace("-", "");
        Map<String, Object> claims = new HashMap<>(4);
        claims.put("accountId", account.getAccountId());
        claims.put(Claims.SUBJECT, account.getEmail());
        claims.put("uuid", uuid);
        // 标记用途，便于排查（不影响校验逻辑）
        claims.put("kind", "customer");
        String token = createToken(claims);
        refreshSession(uuid, account, expireTime);
        return token;
    }

    /**
     * 解析 token 并取出会话里的账号；任何异常都返回 null（视为未登录）
     */
    public CustomerAccount getAccount(String token)
    {
        if (token == null || token.isEmpty())
        {
            return null;
        }
        try
        {
            Claims claims = parseToken(token);
            String uuid = (String) claims.get("uuid");
            if (uuid == null)
            {
                return null;
            }
            String key = getTokenKey(uuid);
            CustomerAccount account = redisCache.getCacheObject(key);
            if (account == null)
            {
                return null;
            }
            // 快过期就续一下
            Long expire = redisCache.getExpire(key);
            if (expire != null && expire > 0 && expire * 1000 < REFRESH_THRESHOLD_MILLIS)
            {
                refreshSession(uuid, account, expireTime);
            }
            return account;
        }
        catch (Exception e)
        {
            // 签名不对 / 过期 / 格式错 —— 一律当作未登录
            return null;
        }
    }

    /**
     * 退出登录：删掉 Redis 会话，token 立即失效
     */
    public void deleteToken(String token)
    {
        if (token == null || token.isEmpty())
        {
            return;
        }
        try
        {
            Claims claims = parseToken(token);
            String uuid = (String) claims.get("uuid");
            if (uuid != null)
            {
                redisCache.deleteObject(getTokenKey(uuid));
            }
        }
        catch (Exception ignored)
        {
            // token 本身无效，无需处理
        }
    }

    /** 账号信息变化（比如选了身份）时刷新会话，免得拿到的还是旧角色 */
    public void refreshSession(String token, CustomerAccount account)
    {
        try
        {
            Claims claims = parseToken(token);
            String uuid = (String) claims.get("uuid");
            if (uuid != null)
            {
                refreshSession(uuid, account, expireTime);
            }
        }
        catch (Exception ignored)
        {
            // 忽略
        }
    }

    private void refreshSession(String uuid, CustomerAccount account, int minutes)
    {
        redisCache.setCacheObject(getTokenKey(uuid), account, minutes, TimeUnit.MINUTES);
    }

    private String createToken(Map<String, Object> claims)
    {
        return Jwts.builder()
                .setClaims(claims)
                .signWith(SignatureAlgorithm.HS512, secret)
                .compact();
    }

    private Claims parseToken(String token)
    {
        return Jwts.parser()
                .setSigningKey(secret)
                .parseClaimsJws(token)
                .getBody();
    }

    private String getTokenKey(String uuid)
    {
        return CUSTOMER_TOKEN_KEY + uuid;
    }
}
