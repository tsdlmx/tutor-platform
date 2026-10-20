package com.tutor.framework.customer;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import com.alibaba.fastjson2.JSON;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.system.domain.CustomerAccount;

/**
 * 客户接口鉴权拦截器
 *
 * 只拦 /customer/**（注册、登录、科目字典除外）。
 * 校验通过后把账号放进 CustomerContext，供 Controller 直接取用。
 *
 * 刻意**不接入 Spring Security**：客户体系与若依的管理后台鉴权完全隔离，
 * 客户请求在 Spring Security 眼里始终是匿名的，因此即使拦截器有疏漏，
 * 也拿不到任何 /system/** 的管理接口。
 *
 * @author 家教中介平台
 */
@Component
public class CustomerAuthInterceptor implements HandlerInterceptor
{
    /** 认证头名（与 application.yml 的 token.header 保持一致） */
    private static final String TOKEN_HEADER = "Authorization";

    /** token 前缀 */
    private static final String BEARER_PREFIX = "Bearer ";

    @Autowired
    private CustomerTokenService customerTokenService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception
    {
        // 预检请求直接放行
        if ("OPTIONS".equalsIgnoreCase(request.getMethod()))
        {
            return true;
        }
        // 非 Controller 方法（静态资源等）不拦
        if (!(handler instanceof HandlerMethod))
        {
            return true;
        }

        String token = resolveToken(request);
        CustomerAccount account = customerTokenService.getAccount(token);
        if (account == null)
        {
            writeUnauthorized(response);
            return false;
        }
        CustomerContext.set(account);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex)
    {
        // 一定要清，线程池会复用线程
        CustomerContext.clear();
    }

    /** 从 Authorization: Bearer xxx 里取 token */
    public static String resolveToken(HttpServletRequest request)
    {
        String header = request.getHeader(TOKEN_HEADER);
        if (header == null || header.isEmpty())
        {
            // 兼容前端把 token 放在自定义头里
            header = request.getHeader("X-Customer-Token");
        }
        if (header == null || header.isEmpty())
        {
            return null;
        }
        if (header.startsWith(BEARER_PREFIX))
        {
            return header.substring(BEARER_PREFIX.length()).trim();
        }
        return header.trim();
    }

    private void writeUnauthorized(HttpServletResponse response) throws Exception
    {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(JSON.toJSONString(AjaxResult.error(401, "未登录或登录已过期")));
        response.getWriter().flush();
    }
}
