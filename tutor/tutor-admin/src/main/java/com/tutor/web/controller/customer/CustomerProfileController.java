package com.tutor.web.controller.customer;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import com.tutor.common.core.controller.BaseController;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.framework.customer.CustomerContext;
import com.tutor.system.domain.CustomerAccount;
import com.tutor.system.domain.TeacherProfile;
import com.tutor.system.domain.UserPost;
import com.tutor.system.service.ICustomerAccountService;
import com.tutor.system.service.IUserProfileService;

/**
 * 个人主页：老师简历
 *
 * 「我的」页面升级成个人社交主页后，老师可以在这里放个人简历。
 *   * /customer/profile/me        —— 自己的主页数据（含邮箱，只有自己能拿）
 *   * /customer/profile/{id}      —— 别人的主页（**不含邮箱**，避免泄露联系方式）
 *   * /customer/profile/{id}/posts —— 某人发的帖子
 *
 * 这些接口都需要登录（客户 token），由 CustomerAuthInterceptor 统一校验。
 *
 * @author 家教中介平台
 */
@RestController
@RequestMapping("/customer/profile")
public class CustomerProfileController extends BaseController
{
    @Autowired
    private IUserProfileService userProfileService;

    @Autowired
    private ICustomerAccountService customerAccountService;

    /**
     * 我的主页数据
     */
    @GetMapping("/me")
    public AjaxResult me()
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        CustomerAccount fresh = customerAccountService.selectById(me.getAccountId());
        CustomerAccount account = fresh == null ? me : fresh;
        account.setPassword(null);
        return AjaxResult.success(buildPayload(account, true));
    }

    /**
     * 保存我的简历（只有老师身份可以写）
     */
    @PutMapping
    public AjaxResult save(@RequestBody TeacherProfile profile)
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!CustomerAccount.ROLE_TEACHER.equals(me.getRole()))
        {
            return AjaxResult.error(400, "只有老师身份可以填写简历");
        }
        if (profile.getRealName() == null || profile.getRealName().trim().isEmpty())
        {
            return AjaxResult.error(400, "请填写真实姓名");
        }
        TeacherProfile saved = userProfileService.saveProfile(me.getAccountId(), profile);
        return AjaxResult.success("简历已保存", saved);
    }

    /**
     * 别人的主页（只读）
     */
    @GetMapping("/{accountId}")
    public AjaxResult detail(@PathVariable("accountId") Long accountId)
    {
        CustomerAccount account = customerAccountService.selectById(accountId);
        if (account == null)
        {
            return AjaxResult.error(400, "账号不存在");
        }
        account.setPassword(null);
        return AjaxResult.success(buildPayload(account, false));
    }

    /**
     * 某人发的帖子（分页）
     */
    @GetMapping("/{accountId}/posts")
    public Object posts(@PathVariable("accountId") Long accountId)
    {
        startPage();
        List<UserPost> rows = userProfileService.listPosts(accountId);
        return getDataTable(rows);
    }

    /**
     * 组装主页数据
     *
     * @param includeEmail 只有看自己的主页才带邮箱
     */
    private Map<String, Object> buildPayload(CustomerAccount account, boolean includeEmail)
    {
        Map<String, Object> payload = new LinkedHashMap<>(4);

        Map<String, Object> brief = new LinkedHashMap<>(5);
        brief.put("accountId", account.getAccountId());
        brief.put("nickname", account.getNickname());
        brief.put("role", account.getRole());
        brief.put("createTime", account.getCreateTime());
        if (account.getLastLoginTime() != null)
        {
            brief.put("lastLoginTime", account.getLastLoginTime());
        }
        if (includeEmail)
        {
            brief.put("email", account.getEmail());
        }
        payload.put("account", brief);

        payload.put("profile", userProfileService.getProfile(account.getAccountId()));
        payload.put("postCount", userProfileService.countPosts(account.getAccountId()));
        return payload;
    }
}
