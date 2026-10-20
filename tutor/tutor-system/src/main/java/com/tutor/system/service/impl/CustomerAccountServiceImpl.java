package com.tutor.system.service.impl;

import java.util.Collections;
import java.util.Date;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.tutor.system.domain.CustomerAccount;
import com.tutor.system.mapper.CustomerAccountMapper;
import com.tutor.system.service.ICustomerAccountService;

/**
 * 客户账号 Service 实现
 *
 * @author 家教中介平台
 */
@Service
public class CustomerAccountServiceImpl implements ICustomerAccountService
{
    @Autowired
    private CustomerAccountMapper customerAccountMapper;

    @Override
    public CustomerAccount selectByEmail(String email)
    {
        return customerAccountMapper.selectByEmail(email);
    }

    @Override
    public CustomerAccount selectById(Long accountId)
    {
        return customerAccountMapper.selectById(accountId);
    }

    @Override
    public int insertAccount(CustomerAccount account)
    {
        return customerAccountMapper.insertAccount(account);
    }

    @Override
    public int updateAccount(CustomerAccount account)
    {
        return customerAccountMapper.updateAccount(account);
    }

    @Override
    public int touchLoginTime(Long accountId)
    {
        CustomerAccount update = new CustomerAccount();
        update.setAccountId(accountId);
        update.setLastLoginTime(new Date());
        return customerAccountMapper.updateAccount(update);
    }

    @Override
    public List<CustomerAccount> selectAccountList(CustomerAccount query)
    {
        return customerAccountMapper.selectAccountList(query);
    }

    @Override
    public List<CustomerAccount> selectByIds(List<Long> ids)
    {
        if (ids == null || ids.isEmpty())
        {
            return Collections.emptyList();
        }
        return customerAccountMapper.selectByIds(ids);
    }
}
