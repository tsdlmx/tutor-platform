package com.tutor.system.service.impl;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.tutor.system.domain.StudentDemand;
import com.tutor.system.mapper.StudentDemandMapper;
import com.tutor.system.service.IStudentDemandService;

/**
 * 学生需求单 Service 实现
 *
 * 业务规则集中在这里：
 *   * 老师端只能看到「未取消」的需求；
 *   * 学生端只能看到 / 改到「自己的」需求（越权一律按不存在处理）。
 *
 * @author 家教中介平台
 */
@Service
public class StudentDemandServiceImpl implements IStudentDemandService
{
    private static final Set<String> VALID_STATUS =
            new LinkedHashSet<>(Arrays.asList("0", "1", "2", "3"));

    private static final Map<String, String> STATUS_TEXT = new LinkedHashMap<>();

    static
    {
        STATUS_TEXT.put("0", "待接单");
        STATUS_TEXT.put("1", "已接单");
        STATUS_TEXT.put("2", "已完成");
        STATUS_TEXT.put("3", "已取消");
    }

    @Autowired
    private StudentDemandMapper studentDemandMapper;

    @Override
    public List<StudentDemand> selectForTeacher(StudentDemand query)
    {
        // studentId 保持 null => mapper 里走「老师视角」分支
        query.setStudentId(null);
        List<StudentDemand> list = studentDemandMapper.selectDemandList(query);
        list.forEach(this::fillViewFields);
        return list;
    }

    @Override
    public List<StudentDemand> selectForStudent(Long studentId, StudentDemand query)
    {
        query.setStudentId(studentId);
        List<StudentDemand> list = studentDemandMapper.selectDemandList(query);
        list.forEach(this::fillViewFields);
        return list;
    }

    @Override
    public StudentDemand selectById(Long demandId)
    {
        StudentDemand demand = studentDemandMapper.selectDemandById(demandId);
        fillViewFields(demand);
        return demand;
    }

    @Override
    public StudentDemand publish(Long studentId, StudentDemand demand)
    {
        demand.setDemandId(null);
        demand.setStudentId(studentId);
        demand.setSubjects(joinSubjects(demand));
        if (demand.getStatus() == null || !VALID_STATUS.contains(demand.getStatus()))
        {
            demand.setStatus(StudentDemand.STATUS_OPEN);
        }
        if (demand.getBudgetUnit() == null || demand.getBudgetUnit().isEmpty())
        {
            demand.setBudgetUnit("hour");
        }
        if (demand.getClassMode() == null || demand.getClassMode().isEmpty())
        {
            demand.setClassMode("both");
        }
        studentDemandMapper.insertDemand(demand);
        return selectById(demand.getDemandId());
    }

    @Override
    public StudentDemand updateOwn(Long studentId, Long demandId, StudentDemand demand)
    {
        StudentDemand existing = studentDemandMapper.selectDemandById(demandId);
        if (existing == null || !existing.getStudentId().equals(studentId))
        {
            // 不是自己的（或不存在）—— 当作不存在，避免泄露他人需求是否存在
            return null;
        }
        demand.setDemandId(demandId);
        demand.setStudentId(studentId);
        if (demand.getSubjectList() != null && !demand.getSubjectList().isEmpty())
        {
            demand.setSubjects(joinSubjects(demand));
        }
        studentDemandMapper.updateDemand(demand);
        return selectById(demandId);
    }

    @Override
    public boolean deleteOwn(Long studentId, Long demandId)
    {
        StudentDemand existing = studentDemandMapper.selectDemandById(demandId);
        if (existing == null || !existing.getStudentId().equals(studentId))
        {
            return false;
        }
        return studentDemandMapper.deleteDemandById(demandId) > 0;
    }

    @Override
    public boolean updateOwnStatus(Long studentId, Long demandId, String status)
    {
        if (status == null || !VALID_STATUS.contains(status))
        {
            return false;
        }
        StudentDemand existing = studentDemandMapper.selectDemandById(demandId);
        if (existing == null || !existing.getStudentId().equals(studentId))
        {
            return false;
        }
        return studentDemandMapper.updateStatus(demandId, status) > 0;
    }

    @Override
    public Map<String, Object> stats()
    {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", studentDemandMapper.countDemands(null));
        result.put("open", studentDemandMapper.countDemands(StudentDemand.STATUS_OPEN));

        BigDecimal avg = studentDemandMapper.avgBudget();
        result.put("avgBudget", avg == null ? BigDecimal.ZERO : avg);

        // 科目分布：库里是一个逗号分隔字段，这里拆开统计
        Map<String, Integer> counter = new TreeMap<>();
        for (String row : studentDemandMapper.selectAllSubjectStrings())
        {
            if (row == null)
            {
                continue;
            }
            for (String s : row.split("[,，]"))
            {
                String key = s.trim();
                if (!key.isEmpty())
                {
                    counter.merge(key, 1, Integer::sum);
                }
            }
        }
        List<Map<String, Object>> bySubject = new ArrayList<>();
        for (Map.Entry<String, Integer> e : counter.entrySet())
        {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", e.getKey());
            item.put("count", e.getValue());
            bySubject.add(item);
        }
        result.put("bySubject", bySubject);
        return result;
    }

    /** 把 subjectList 拼成 "数学,物理"，同时去掉空白与重复 */
    private String joinSubjects(StudentDemand demand)
    {
        List<String> raw = demand.getSubjectList();
        if (raw == null || raw.isEmpty())
        {
            return demand.getSubjects() == null ? "" : demand.getSubjects().trim();
        }
        Set<String> unique = new LinkedHashSet<>();
        for (String s : raw)
        {
            if (s != null && !s.trim().isEmpty())
            {
                unique.add(s.trim());
            }
        }
        return String.join(",", unique);
    }

    /** 补上给前端用的展示字段：科目数组 + 状态中文 */
    private void fillViewFields(StudentDemand demand)
    {
        if (demand == null)
        {
            return;
        }
        String subjects = demand.getSubjects();
        List<String> list = new ArrayList<>();
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
        demand.setSubjectList(list);
        demand.setStatusText(STATUS_TEXT.getOrDefault(demand.getStatus(), "未知"));
    }
}
