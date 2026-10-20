package com.tutor.system.mapper;

import com.tutor.system.domain.TeacherProfile;

/**
 * 老师简历 Mapper
 *
 * @author 家教中介平台
 */
public interface TeacherProfileMapper
{
    /** 按账号查简历 */
    TeacherProfile selectByAccountId(Long accountId);

    /** 新增简历 */
    int insertProfile(TeacherProfile profile);

    /** 更新简历（只更新非空字段） */
    int updateProfile(TeacherProfile profile);
}
