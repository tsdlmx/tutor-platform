package com.tutor.system.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.tutor.common.exception.ServiceException;
import com.tutor.system.domain.TeacherProfile;
import com.tutor.system.domain.UserPost;
import com.tutor.system.mapper.TeacherProfileMapper;
import com.tutor.system.mapper.UserPostMapper;
import com.tutor.system.service.IUserProfileService;

/**
 * 个人主页 Service 实现
 *
 * @author 家教中介平台
 */
@Service
public class UserProfileServiceImpl implements IUserProfileService
{
    /** 帖子正文上限 */
    private static final int POST_MAX_LEN = 1000;

    @Autowired
    private TeacherProfileMapper teacherProfileMapper;

    @Autowired
    private UserPostMapper userPostMapper;

    @Override
    public TeacherProfile getProfile(Long accountId)
    {
        TeacherProfile profile = teacherProfileMapper.selectByAccountId(accountId);
        if (profile != null)
        {
            fillSubjectList(profile);
        }
        return profile;
    }

    @Override
    public TeacherProfile saveProfile(Long accountId, TeacherProfile profile)
    {
        profile.setAccountId(accountId);
        // 科目数组 -> 逗号分隔字符串（前端传 subjectList）
        if (profile.getSubjectList() != null && !profile.getSubjectList().isEmpty())
        {
            Set<String> unique = new LinkedHashSet<>();
            for (String s : profile.getSubjectList())
            {
                if (s != null && !s.trim().isEmpty())
                {
                    unique.add(s.trim());
                }
            }
            profile.setSubjects(String.join(",", unique));
        }

        TeacherProfile existing = teacherProfileMapper.selectByAccountId(accountId);
        if (existing == null)
        {
            teacherProfileMapper.insertProfile(profile);
        }
        else
        {
            teacherProfileMapper.updateProfile(profile);
        }
        return getProfile(accountId);
    }

    /** 审核状态：通过 */
    public static final String AUDIT_PASS = "1";

    /** 审核状态：拒绝 */
    public static final String AUDIT_REJECT = "2";

    /** 审核状态：待审核 */
    public static final String AUDIT_PENDING = "0";

    @Override
    public List<UserPost> listPosts(Long accountId)
    {
        // 公开主页只展示审核通过的
        List<UserPost> list = userPostMapper.selectPostList(accountId, AUDIT_PASS);
        list.forEach(this::fillImageList);
        return list;
    }

    @Override
    public List<UserPost> listPostsForOwner(Long accountId)
    {
        // 本人看自己的帖：全部状态（待审、被拒都要能看到，否则不知道发没发出去）
        List<UserPost> list = userPostMapper.selectPostList(accountId, null);
        list.forEach(this::fillImageList);
        return list;
    }

    @Override
    public List<UserPost> listPlazaPosts()
    {
        List<UserPost> list = userPostMapper.selectPostList(null, AUDIT_PASS);
        list.forEach(this::fillImageList);
        return list;
    }

    @Override
    public List<UserPost> listPostsByAuditStatus(String auditStatus)
    {
        List<UserPost> list = userPostMapper.selectPostList(null, auditStatus);
        list.forEach(this::fillImageList);
        return list;
    }

    @Override
    public boolean auditPost(Long postId, String auditStatus, String auditRemark)
    {
        if (!AUDIT_PASS.equals(auditStatus) && !AUDIT_REJECT.equals(auditStatus))
        {
            throw new ServiceException("审核结果只能是「通过」或「拒绝」", 400);
        }
        UserPost post = userPostMapper.selectPostById(postId);
        if (post == null)
        {
            throw new ServiceException("帖子不存在", 404);
        }
        return userPostMapper.updateAudit(postId, auditStatus, auditRemark) > 0;
    }

    @Override
    public int countPendingPosts()
    {
        return userPostMapper.countByAccount(null, AUDIT_PENDING);
    }

    @Override
    public UserPost publishPost(Long accountId, String content, List<String> imageList)
    {
        String text = content == null ? "" : content.trim();
        if (text.isEmpty())
        {
            throw new ServiceException("说点什么再发布吧", 400);
        }
        if (text.length() > POST_MAX_LEN)
        {
            throw new ServiceException("内容不能超过 " + POST_MAX_LEN + " 字", 400);
        }

        UserPost post = new UserPost();
        post.setAccountId(accountId);
        post.setContent(text);
        if (imageList != null && !imageList.isEmpty())
        {
            List<String> cleaned = new ArrayList<>();
            for (String img : imageList)
            {
                if (img != null && !img.trim().isEmpty())
                {
                    cleaned.add(img.trim());
                }
            }
            if (!cleaned.isEmpty())
            {
                post.setImages(String.join(",", cleaned));
            }
        }
        userPostMapper.insertPost(post);

        UserPost saved = userPostMapper.selectPostById(post.getPostId());
        fillImageList(saved);
        return saved;
    }

    @Override
    public boolean deleteOwnPost(Long accountId, Long postId)
    {
        UserPost post = userPostMapper.selectPostById(postId);
        // 不是自己的（或不存在）一律按不存在处理，避免暴露别人帖子是否存在
        if (post == null || !post.getAccountId().equals(accountId))
        {
            return false;
        }
        return userPostMapper.deletePostById(postId) > 0;
    }

    @Override
    public int countPosts(Long accountId)
    {
        // 个人主页上显示的「N 条动态」= 审核通过的条数（与访客看到的一致）
        return userPostMapper.countByAccount(accountId, AUDIT_PASS);
    }

    /** 拆 subjects -> subjectList，方便前端直接用 */
    private void fillSubjectList(TeacherProfile profile)
    {
        List<String> list = new ArrayList<>();
        String subjects = profile.getSubjects();
        if (subjects != null && !subjects.isEmpty())
        {
            for (String s : subjects.split("[,，]"))
            {
                if (!s.trim().isEmpty())
                {
                    list.add(s.trim());
                }
            }
        }
        profile.setSubjectList(list);
    }

    /** 拆 images -> imageList */
    private void fillImageList(UserPost post)
    {
        if (post == null)
        {
            return;
        }
        List<String> list = new ArrayList<>();
        String images = post.getImages();
        if (images != null && !images.isEmpty())
        {
            for (String s : images.split("[,，]"))
            {
                if (!s.trim().isEmpty())
                {
                    list.add(s.trim());
                }
            }
        }
        post.setImageList(list);
    }
}
