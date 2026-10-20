package com.tutor.system.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import com.tutor.system.domain.UserPost;

/**
 * 个人主页帖子 Mapper
 *
 * @author 家教中介平台
 */
public interface UserPostMapper
{
    /**
     * 帖子列表（分页交给 PageHelper）
     *
     * @param accountId   作者账号ID；null = 不限作者（广场）
     * @param auditStatus 审核状态；null = 不限
     */
    List<UserPost> selectPostList(@Param("accountId") Long accountId,
                                  @Param("auditStatus") String auditStatus);

    /** 帖子详情 */
    UserPost selectPostById(@Param("postId") Long postId);

    /** 帖子总数（可按作者 / 审核状态过滤） */
    int countByAccount(@Param("accountId") Long accountId,
                       @Param("auditStatus") String auditStatus);

    /** 审核：更新状态与备注 */
    int updateAudit(@Param("postId") Long postId,
                    @Param("auditStatus") String auditStatus,
                    @Param("auditRemark") String auditRemark);

    /** 新增 */
    int insertPost(UserPost post);

    /** 逻辑删除 */
    int deletePostById(@Param("postId") Long postId);
}
