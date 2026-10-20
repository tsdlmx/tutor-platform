package com.tutor.web.controller.customer;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import com.tutor.common.core.controller.BaseController;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.framework.customer.CustomerContext;
import com.tutor.system.domain.CustomerAccount;
import com.tutor.system.domain.DemandApply;
import com.tutor.system.domain.StudentDemand;
import com.tutor.system.service.IDemandApplyService;
import com.tutor.system.service.IStudentDemandService;

/**
 * 学生需求单
 *
 * 老师端（/teacher 页面）在这里拉「所有学生的需求」；
 * 学生端（/student 页面）在这里发布、修改、删除自己的需求。
 *
 * @author 家教中介平台
 */
@RestController
@RequestMapping("/customer/demands")
public class CustomerDemandController extends BaseController
{
    @Autowired
    private IStudentDemandService studentDemandService;

    @Autowired
    private IDemandApplyService demandApplyService;

    /**
     * 需求列表（契约里的 GET /customer/demands）
     *   老师 -> 所有学生发布的未取消需求
     *   学生 -> 自己的全部需求
     */
    @GetMapping
    public Object list(StudentDemand query)
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!me.hasRole())
        {
            return AjaxResult.error(400, "请先选择你的身份（老师 / 学生）");
        }
        startPage();
        List<StudentDemand> rows = CustomerAccount.ROLE_TEACHER.equals(me.getRole())
                ? studentDemandService.selectForTeacher(query)
                : studentDemandService.selectForStudent(me.getAccountId(), query);
        return getDataTable(rows);
    }

    /**
     * 老师端首页统计
     */
    @GetMapping("/stats")
    public AjaxResult stats()
    {
        return AjaxResult.success(studentDemandService.stats());
    }

    /**
     * 需求详情
     */
    @GetMapping("/{demandId}")
    public AjaxResult detail(@PathVariable("demandId") Long demandId)
    {
        StudentDemand demand = studentDemandService.selectById(demandId);
        if (demand == null)
        {
            return AjaxResult.error(404, "需求不存在");
        }
        return AjaxResult.success(demand);
    }

    /**
     * 发布需求（只有学生身份可以）
     */
    @PostMapping
    public AjaxResult publish(@RequestBody StudentDemand body)
    {
        CustomerAccount me = CustomerContext.get();
        AjaxResult denied = requireStudent(me);
        if (denied != null)
        {
            return denied;
        }
        AjaxResult invalid = validate(body);
        if (invalid != null)
        {
            return invalid;
        }
        StudentDemand created = studentDemandService.publish(me.getAccountId(), body);
        return AjaxResult.success("需求已发布", created);
    }

    /**
     * 修改自己的需求
     */
    @PutMapping("/{demandId}")
    public AjaxResult update(@PathVariable("demandId") Long demandId, @RequestBody StudentDemand body)
    {
        CustomerAccount me = CustomerContext.get();
        AjaxResult denied = requireStudent(me);
        if (denied != null)
        {
            return denied;
        }
        AjaxResult invalid = validate(body);
        if (invalid != null)
        {
            return invalid;
        }
        StudentDemand updated = studentDemandService.updateOwn(me.getAccountId(), demandId, body);
        if (updated == null)
        {
            return AjaxResult.error(404, "需求不存在或不属于你");
        }
        return AjaxResult.success("需求已更新", updated);
    }

    /**
     * 删除自己的需求（逻辑删除）
     */
    @DeleteMapping("/{demandId}")
    public AjaxResult remove(@PathVariable("demandId") Long demandId)
    {
        CustomerAccount me = CustomerContext.get();
        AjaxResult denied = requireStudent(me);
        if (denied != null)
        {
            return denied;
        }
        if (!studentDemandService.deleteOwn(me.getAccountId(), demandId))
        {
            return AjaxResult.error(404, "需求不存在或不属于你");
        }
        return AjaxResult.success("需求已删除");
    }

    /**
     * 改自己需求的状态（接单/完成/取消）
     */
    @PutMapping("/{demandId}/status")
    public AjaxResult changeStatus(@PathVariable("demandId") Long demandId,
                                   @RequestBody java.util.Map<String, String> body)
    {
        CustomerAccount me = CustomerContext.get();
        AjaxResult denied = requireStudent(me);
        if (denied != null)
        {
            return denied;
        }
        if (!studentDemandService.updateOwnStatus(me.getAccountId(), demandId, body.get("status")))
        {
            return AjaxResult.error(400, "状态不合法，或该需求不属于你");
        }
        return AjaxResult.success("状态已更新");
    }

    /* ---------------- 老师：申请联系 ---------------- */

    /**
     * 老师对某条需求「申请联系」。
     * 申请记录会出现在学生「我的 → 老师申请」模块里。
     */
    @PostMapping("/{demandId}/apply")
    public AjaxResult apply(@PathVariable("demandId") Long demandId,
                            @RequestBody(required = false) java.util.Map<String, String> body)
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!CustomerAccount.ROLE_TEACHER.equals(me.getRole()))
        {
            return AjaxResult.error(403, "只有老师身份可以申请联系学生");
        }
        String message = body == null ? null : body.get("message");
        DemandApply apply = demandApplyService.apply(me.getAccountId(), demandId, message);
        return AjaxResult.success("已提交申请，学生会在「我的」里看到你", apply);
    }

    /**
     * 我（老师）申请过的需求ID列表 —— 前端用它把按钮显示成「已申请」
     */
    @GetMapping("/applied")
    public AjaxResult applied()
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!CustomerAccount.ROLE_TEACHER.equals(me.getRole()))
        {
            return AjaxResult.success(new java.util.ArrayList<Long>());
        }
        return AjaxResult.success(demandApplyService.appliedDemandIds(me.getAccountId()));
    }

    /**
     * 我（学生）发布的需求收到的老师申请 —— 「我的 → 老师申请」模块
     */
    @GetMapping("/applications")
    public AjaxResult applications()
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!CustomerAccount.ROLE_STUDENT.equals(me.getRole()))
        {
            return AjaxResult.success(new java.util.ArrayList<DemandApply>());
        }
        return AjaxResult.success(demandApplyService.receivedByStudent(me.getAccountId()));
    }

    /* ------------------------------------------------------------------ */

    private AjaxResult requireStudent(CustomerAccount me)
    {
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!CustomerAccount.ROLE_STUDENT.equals(me.getRole()))
        {
            return AjaxResult.error(403, "只有学生身份可以发布/管理需求");
        }
        return null;
    }

    /** 发布/修改的字段校验 */
    private AjaxResult validate(StudentDemand body)
    {
        if (body.getTitle() == null || body.getTitle().trim().isEmpty())
        {
            return AjaxResult.error(400, "请填写需求标题");
        }
        boolean noSubjects = (body.getSubjectList() == null || body.getSubjectList().isEmpty())
                && (body.getSubjects() == null || body.getSubjects().trim().isEmpty());
        if (noSubjects)
        {
            return AjaxResult.error(400, "请至少选择一个科目");
        }
        BigDecimal min = body.getBudgetMin();
        BigDecimal max = body.getBudgetMax();
        if (min != null && max != null && max.compareTo(min) < 0)
        {
            return AjaxResult.error(400, "预算上限不能小于下限");
        }
        return null;
    }
}
