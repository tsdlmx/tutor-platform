package com.tutor.framework.config;

import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import com.tutor.common.config.RuoYiConfig;
import com.tutor.common.constant.Constants;
import com.tutor.framework.customer.CustomerAuthInterceptor;
import com.tutor.framework.interceptor.RepeatSubmitInterceptor;

/**
 * 通用配置
 * 
 * @author：小孟微信：codemeng
 */
@Configuration
public class ResourcesConfig implements WebMvcConfigurer
{
    @Autowired
    private RepeatSubmitInterceptor repeatSubmitInterceptor;

    /**
     * 客户接口鉴权拦截器（邮箱账号体系，与若依后台鉴权隔离）
     */
    @Autowired
    private CustomerAuthInterceptor customerAuthInterceptor;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry)
    {
        /** 本地文件上传路径 */
        registry.addResourceHandler(Constants.RESOURCE_PREFIX + "/**")
                .addResourceLocations("file:" + RuoYiConfig.getProfile() + "/");

        /** swagger配置 */
        registry.addResourceHandler("/swagger-ui/**")
                .addResourceLocations("classpath:/META-INF/resources/webjars/springfox-swagger-ui/")
                .setCacheControl(CacheControl.maxAge(5, TimeUnit.HOURS).cachePublic());
    }

    /**
     * 自定义拦截规则
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry)
    {
        registry.addInterceptor(repeatSubmitInterceptor).addPathPatterns("/**");

        /*
          客户接口：自己校验客户 token。
          这几个不需要登录（用户还没登录才能用）：注册、登录、发注册码、发重置码、重置密码、科目字典。
          其余 /customer/** 都要 token。
        */
        registry.addInterceptor(customerAuthInterceptor)
                .addPathPatterns("/customer/**")
                .excludePathPatterns(
                        "/customer/auth/register",
                        "/customer/auth/login",
                        "/customer/auth/send-code",
                        "/customer/auth/send-reset-code",
                        "/customer/auth/reset-password",
                        "/customer/subjects");
    }

    /**
     * 跨域配置
     */
    @Bean
    public CorsFilter corsFilter()
    {
        CorsConfiguration config = new CorsConfiguration();
        // 设置访问源地址
        config.addAllowedOriginPattern("*");
        // 设置访问源请求头
        config.addAllowedHeader("*");
        // 设置访问源请求方法
        config.addAllowedMethod("*");
        // 有效期 1800秒
        config.setMaxAge(1800L);
        // 添加映射路径，拦截一切请求
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        // 返回新的CorsFilter
        return new CorsFilter(source);
    }
}