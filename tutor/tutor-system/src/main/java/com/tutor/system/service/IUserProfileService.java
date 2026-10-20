package com.tutor.system.service;

import java.util.List;
import com.tutor.system.domain.TeacherProfile;
import com.tutor.system.domain.UserPost;

/**
 * 个人主页 Service：老师简历 + 帖子
 *
 * @author 家教中介平台
 */
public interface IUserProfileService
{
    /* ---------------- 简历 ---------------- */

    /** 取某人的简历（可能为 null） */
    TeacherProfile getProfile(Long accountId);

    /**
     * 保存简历（不存在则新建）
     * 只允许老师身份 —— 身份校验在 controller 里做，这里只管数据。
     */
    TeacherProfile saveProfile(Long accountId, TeacherProfile profile);

    /* ---------------- 帖子 ---------------- */

    /** 某人发的帖子：**只看审核通过的**（公开主页用） */
    List<UserPost> listPosts(Long accountId);

    /** 某人发的帖子：全部状态（本人看自己的，含待审/被拒） */
    List<UserPost> listPostsForOwner(Long accountId);

    /** 广场：所有人审核通过的帖子（accountId = null, auditStatus = 1） */
    List<UserPost> listPlazaPosts();

    /** 后台：按审核状态列出帖子（status 为 null 表示全部） */
    List<UserPost> listPostsByAuditStatus(String auditStatus);

    /** 后台审核：1 通过 / 2 拒绝（可带拒绝理由） */
    boolean auditPost(Long postId, String auditStatus, String auditRemark);

    /** 待审核帖子数（后台角标用） */
    int countPendingPosts();

    /** 发帖 */
    UserPost publishPost(Long accountId, String content, List<String> imageList);

    /** 删自己的帖子；返回 false 表示不存在或不是本人的 */
    boolean deleteOwnPost(Long accountId, Long postId);

    /** 某人帖子数 */
    int countPosts(Long accountId);
}
