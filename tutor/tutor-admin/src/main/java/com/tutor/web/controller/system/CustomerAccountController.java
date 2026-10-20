package com.tutor.web.controller.system;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.tutor.common.annotation.Log;
import com.tutor.common.core.controller.BaseController;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.common.core.page.TableDataInfo;
import com.tutor.common.enums.BusinessType;
import com.tutor.system.domain.CustomerAccount;
import com.tutor.system.service.ICustomerAccountService;

/**
 * 客户账号（管理后台视角）
 *
 * 平台的门面是客户侧：客户用邮箱注册，注册完自己选「老师」或「学生」。
 * 后台需要能看到这两类人，所以这里按 role 提供列表：
 *   * role=TEACHER -> 「老师信息」页
 *   * role=STUDENT -> 「学生信息」页
 *
 * 注意：客户账号存在 t_customer_account，**不在 sys_user 里**，
 * 所以这个接口只是"查看"，与后台自身的管理员账号体系互不影响。
 *
 * @author 家教中介平台
 */
@RestController
@RequestMapping("/system/customerAccount")
public class CustomerAccountController extends BaseController
{
    @Autowired
    private ICustomerAccountService customerAccountService;

    /**
     * 客户账号列表（按 role 区分老师 / 学生），支持邮箱、昵称、状态筛选
     */
    @PreAuthorize("@ss.hasPermi('system:customerAccount:list')")
    @GetMapping("/list")
    public TableDataInfo list(CustomerAccount query)
    {
        startPage();
        List<CustomerAccount> list = customerAccountService.selectAccountList(query);
        return getDataTable(list);
    }

    /**
     * 账号详情
     */
    @PreAuthorize("@ss.hasPermi('system:customerAccount:query')")
    @GetMapping("/{accountId}")
    public AjaxResult getInfo(@PathVariable("accountId") Long accountId)
    {
        return success(customerAccountService.selectById(accountId));
    }

    /**
     * 启用 / 停用账号（status：0 正常，1 停用）
     *
     * 停用后该账号在客户端无法登录（CustomerAuthService.login 会拦），
     * 已经登录的会话也会因为 token 里的账号状态而失效。
     */
    @PreAuthorize("@ss.hasPermi('system:customerAccount:edit')")
    @Log(title = "客户账号", businessType = BusinessType.UPDATE)
    @PutMapping("/status")
    public AjaxResult changeStatus(@RequestBody CustomerAccount body)
    {
        if (body.getAccountId() == null)
        {
            return error("缺少账号ID");
        }
        String status = body.getStatus();
        if (!"0".equals(status) && !"1".equals(status))
        {
            return error("状态只能是 0（正常）或 1（停用）");
        }
        CustomerAccount update = new CustomerAccount();
        update.setAccountId(body.getAccountId());
        update.setStatus(status);
        customerAccountService.updateAccount(update);
        return success("1".equals(status) ? "账号已停用" : "账号已启用");
    }
}
