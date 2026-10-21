# Agent 开发指南

本文面向在本仓库中协作的 AI agent 和开发者。仓库中的旧说明可能与当前配置不同；改动前以源码、配置、锁文件和正在使用的脚本为准。

## 项目结构

- tutor/tutor-admin：Spring Boot 后端应用入口。
- tutor/tutor-*：后端 Maven 模块。
- tutor/tutor-web：React、TypeScript、Vite Web 前端。
- tutor/tutor-uniapp：Vue 3、uni-app 移动端项目。
- bin-linux：Linux 启动和部署脚本。
- docs：项目文档。

后端 Maven 项目版本为 3.9.0，使用 Java 8。Web 前端包版本为 1.0.0。前端锁文件为 pnpm 锁文件 v9 格式，但由 pnpm 12 写入（只含 snapshots 段），pnpm 9 已无法读取；实测 pnpm 10 与 12 都能 --frozen-lockfile 安装。

## 开始工作前

1. 先复述代码任务，指出会影响实现的歧义；给出方案和小任务拆分。涉及算法问题时说明复杂度。
2. 信息不足会影响正确性或安全性时，先询问用户。代码修改先等用户确认方案；用户已明确授权直接实施的范围除外。
3. 先检查目标模块和已有约定，不要仅凭旧 README 或注释推断当前行为。
4. 每次修改后说明改了什么、为什么改、可能风险是什么。

## 配置与本地运行

后端本地配置默认使用：

- HTTP 端口：12501
- MySQL：localhost:3307，数据库 tutor
- Redis：localhost:6379
- 必需环境变量：DB_USERNAME、DB_PASSWORD、REDIS_PASSWORD、JWT_SECRET

真实密钥和账号只能通过本地环境或受控的部署配置提供。不要写入源码、示例配置、日志或提交记录。JWT 配置注释约定密钥为 64 位十六进制字符串。

构建后端的命令：

~~~powershell
mvn -f .\tutor\pom.xml -pl tutor-admin -am package
~~~

Web 前端位于 tutor/tutor-web，使用 pnpm 10 或更高版本（pnpm 9 无法读取当前锁文件）。常用命令：

~~~powershell
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
~~~

前端 Vite 配置的默认开发端口为 12500，默认监听所有网卡；本机开发时应显式绑定 127.0.0.1。开发代理从 VITE_PROXY_TARGET 读取后端地址；仓库开发环境文件当前指向 127.0.0.1:12501。前端预览端口为 4173。

Linux/Windows 启动脚本依赖的目录、端口和运行时文件可能不同。运行前先检查脚本实际行为；不要假设全新克隆包含运行时或编译产物。

## 安全与数据边界

- 服务端必须校验对象级权限和角色权限，不能仅依赖前端隐藏按钮或客户端提交的资源 ID。
- 不记录 JWT、验证码、微信凭据、密码或其他可复用密钥；需要排查时使用脱敏值。
- 上传文件应校验类型和内容，避免将可执行内容作为可信网页公开。
- 只信任明确配置的反向代理转发头；不能直接信任任意客户端提供的 X-Forwarded-For。
- 根目录 .gitignore 明确排除了 tutor/sql/tutor.sql。该导出包含业务数据，不要读取、复制、解除忽略或提交它。数据库初始化应使用不含真实业务数据的 schema、迁移或演示数据。
- 不得为方便本地运行而关闭认证、授权、TLS 或密钥校验。

## 验证与交付

- 修改前确认目标文件和当前工作区状态，不覆盖用户已有改动。
- 只有在用户要求测试或验证时才新增或运行测试；如未运行，明确说明验证范围。
- 先检查差异、敏感信息和 Git 状态，再暂存明确相关的文件。
- 仅在用户明确要求时提交或推送；提交前说明变更范围，提交时使用简洁且准确的消息。
- 文档中的命令、端口和环境变量应与当前配置一致；不把历史个人路径、账号、凭据或生产数据写入文档。
