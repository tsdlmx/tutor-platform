# tutor 目录说明

**权威文档在仓库根目录：[../README.md](../README.md)（接口清单、已实现功能、边界）、[../AGENTS.md](../AGENTS.md)（协作约定）。**

| 目录 | 说明 |
| --- | --- |
| `tutor-api/` | Go Web API（当前唯一后端） |
| `tutor-web/` | React 管理台 + 客户 H5 |
| `tutor-uniapp/` | uni-app 静态样张，不构建、不部署 |
| `tutor-ui/` | 空目录 |
| `sql/` | MySQL 旧数据源的建库/补丁脚本（`cmd/import-legacy` 导入前使用；`tutor.sql` 含业务数据，已被 .gitignore 排除） |
| `docs/`、`picture/` | 界面截图与素材 |

## Java 后端去哪了

原先的 `tutor-admin`、`tutor-common`、`tutor-framework`、`tutor-system`、`tutor-quartz`、`tutor-generator` 与 `tutor/pom.xml` 已从 `main` 删除；连同 Java 时代的启动脚本（`tutor/bin/`）、验证脚本（`tutor/tools/`）和历史说明（`README-RUN.md`、`坑点.txt`、`../PORTING-LINUX.md`、`../docs/CUSTOMER-API.md`）一起移除。所有客户端请求都已切到 Go 服务。

需要查看旧实现时：

```bash
git checkout legacy-java-final        # 或 git show legacy-java-final:tutor/pom.xml
```

许可证见 [LICENSE](LICENSE)。
