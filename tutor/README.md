# tutor 目录说明

**权威文档在仓库根目录：[../README.md](../README.md)（接口清单、已实现功能、边界）、[../AGENTS.md](../AGENTS.md)（协作约定）。**

本目录只剩实际在用的部分：

| 目录 | 说明 |
| --- | --- |
| `tutor-api/` | Go Web API（当前唯一后端） |
| `tutor-web/` | React 管理台 + 客户 H5 |
| `tutor-uniapp/` | uni-app 静态样张，不构建、不部署 |
| `tutor-ui/` | 空目录 |
| `sql/`、`bin/`、`tools/`、`docs/`、`picture/` | Java 时代的导出数据、旧脚本、验证脚本与图片，仅作历史参考 |

## Java 后端去哪了

原先的 `tutor-admin`、`tutor-common`、`tutor-framework`、`tutor-system`、`tutor-quartz`、`tutor-generator` 与 `tutor/pom.xml` 已从 `main` 删除：所有客户端请求已切到 Go 服务，Java 不再有消费者。

需要查看旧实现时：

```bash
git checkout legacy-java-final        # 或 git show legacy-java-final:tutor/pom.xml
```

`README-RUN.md`、`坑点.txt`、`../PORTING-LINUX.md` 记录的是 Java 时代的运行与移植过程，属于历史资料，其中的端口、脚本与命令**不再对应当前代码**。

许可证见 [LICENSE](LICENSE)。
