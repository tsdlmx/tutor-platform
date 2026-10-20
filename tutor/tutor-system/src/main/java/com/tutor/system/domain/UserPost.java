package com.tutor.system.domain;

import java.util.List;
import com.tutor.common.core.domain.BaseEntity;

/**
 * 个人主页帖子
 *
 * @author 家教中介平台
 */
public class UserPost extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 帖子ID */
    private Long postId;

    /** 作者账号ID */
    private Long accountId;

    /** 正文 */
    private String content;

    /** 图片地址，逗号分隔（存库形态） */
    private String images;

    /** 审核状态 0待审核 1通过 2拒绝 */
    private String auditStatus;

    /** 审核备注（拒绝理由） */
    private String auditRemark;

    /** 字段名与前端约定：前端用 auditStatus 判断是否展示 */
    private java.util.Date auditTime;

    /** 删除标记 */
    private String delFlag;

    /* ---------------- 以下为展示字段，不落库 ---------------- */

    /** 前端传入的图片数组 */
    private List<String> imageList;

    /** 作者昵称 */
    private String authorName;

    /** 作者身份 TEACHER / STUDENT */
    private String authorRole;

    public String getAuditStatus()
    {
        return auditStatus;
    }

    public void setAuditStatus(String auditStatus)
    {
        this.auditStatus = auditStatus;
    }

    public String getAuditRemark()
    {
        return auditRemark;
    }

    public void setAuditRemark(String auditRemark)
    {
        this.auditRemark = auditRemark;
    }

    public java.util.Date getAuditTime()
    {
        return auditTime;
    }

    public void setAuditTime(java.util.Date auditTime)
    {
        this.auditTime = auditTime;
    }

    public Long getPostId()
    {
        return postId;
    }

    public void setPostId(Long postId)
    {
        this.postId = postId;
    }

    public Long getAccountId()
    {
        return accountId;
    }

    public void setAccountId(Long accountId)
    {
        this.accountId = accountId;
    }

    public String getContent()
    {
        return content;
    }

    public void setContent(String content)
    {
        this.content = content;
    }

    public String getImages()
    {
        return images;
    }

    public void setImages(String images)
    {
        this.images = images;
    }

    public String getDelFlag()
    {
        return delFlag;
    }

    public void setDelFlag(String delFlag)
    {
        this.delFlag = delFlag;
    }

    public List<String> getImageList()
    {
        return imageList;
    }

    public void setImageList(List<String> imageList)
    {
        this.imageList = imageList;
    }

    public String getAuthorName()
    {
        return authorName;
    }

    public void setAuthorName(String authorName)
    {
        this.authorName = authorName;
    }

    public String getAuthorRole()
    {
        return authorRole;
    }

    public void setAuthorRole(String authorRole)
    {
        this.authorRole = authorRole;
    }
}
