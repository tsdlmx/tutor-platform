package com.tutor.web.controller.system;

import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import com.tutor.common.core.controller.BaseController;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.system.domain.UserPost;
import com.tutor.system.service.IUserProfileService;

/**
 * 管理后台：帖子审核
 *
 * 客户发的帖子在广场/个人主页展示前必须经过这里审核：
 *   0 待审核 → 1 通过（出现在广场与个人主页） / 2 拒绝（只有作者本人可见，带拒绝理由）
 *
 * @author 家教中介平台
 */
@RestController
@RequestMapping("/system/userPost")
public class SysUserPostController extends BaseController
{
    @Autowired
    private IUserProfileService userProfileService;

    /** 帖子列表：auditStatus 不传 = 全部；传 0 = 待审核队列 */
    @GetMapping("/list")
    public Object list(@RequestParam(value = "auditStatus", required = false) String auditStatus)
    {
        startPage();
        List<UserPost> rows = userProfileService.listPostsByAuditStatus(auditStatus);
        return getDataTable(rows);
    }

    /** 待审核条数（侧栏角标） */
    @GetMapping("/pendingCount")
    public AjaxResult pendingCount()
    {
        return AjaxResult.success(userProfileService.countPendingPosts());
    }

    /**
     * 审核：{ postId, auditStatus: '1'|'2', auditRemark? }
     */
    @PutMapping("/audit")
    public AjaxResult audit(@RequestBody Map<String, Object> body)
    {
        Object id = body.get("postId");
        if (id == null)
        {
            return AjaxResult.error(400, "缺少 postId");
        }
        Long postId;
        try
        {
            postId = Long.valueOf(String.valueOf(id));
        }
        catch (NumberFormatException e)
        {
            return AjaxResult.error(400, "postId 不合法");
        }
        String status = body.get("auditStatus") == null ? null : String.valueOf(body.get("auditStatus"));
        String remark = body.get("auditRemark") == null ? null : String.valueOf(body.get("auditRemark"));
        userProfileService.auditPost(postId, status, remark);
        return AjaxResult.success("1".equals(status) ? "已通过" : "已拒绝");
    }
}
