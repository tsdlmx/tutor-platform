package com.tutor.web.controller.customer;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import com.tutor.common.core.controller.BaseController;
import com.tutor.common.core.domain.AjaxResult;
import com.tutor.framework.customer.CustomerContext;
import com.tutor.system.domain.CustomerAccount;
import com.tutor.system.domain.UserPost;
import com.tutor.system.service.IUserProfileService;

/**
 * 个人主页：帖子
 *
 * 所有登录的客户都可以发帖；**帖子发布后先进入待审核，管理后台通过才会出现在
 * 个人主页 / 广场里**（自己能看到自己的待审帖子，并带「待审核」标记）。
 *
 * @author 家教中介平台
 */
@RestController
@RequestMapping("/customer/posts")
public class CustomerPostController extends BaseController
{
    @Autowired
    private IUserProfileService userProfileService;

    /**
     * 我发的帖子（分页）—— 含待审核 / 被拒，本人可见
     */
    @GetMapping("/mine")
    public Object mine()
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        startPage();
        List<UserPost> rows = userProfileService.listPostsForOwner(me.getAccountId());
        return getDataTable(rows);
    }

    /**
     * 广场：所有人「审核通过」的帖子（分页）
     */
    @GetMapping("/plaza")
    public Object plaza()
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        startPage();
        List<UserPost> rows = userProfileService.listPlazaPosts();
        return getDataTable(rows);
    }

    /**
     * 发帖
     */
    @PostMapping
    public AjaxResult publish(@RequestBody UserPost body)
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        UserPost saved = userProfileService.publishPost(
                me.getAccountId(), body.getContent(), body.getImageList());
        return AjaxResult.success("已提交，审核通过后会展示在广场上", saved);
    }

    /**
     * 删自己的帖子
     */
    @DeleteMapping("/{postId}")
    public AjaxResult remove(@PathVariable("postId") Long postId)
    {
        CustomerAccount me = CustomerContext.get();
        if (me == null)
        {
            return AjaxResult.error(401, "未登录或登录已过期");
        }
        if (!userProfileService.deleteOwnPost(me.getAccountId(), postId))
        {
            return AjaxResult.error(404, "帖子不存在或不属于你");
        }
        return AjaxResult.success("已删除");
    }
}
