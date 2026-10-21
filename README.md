<h1 align="center">Tutor Platform</h1>

<p align="center">家教预约与管理平台</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License">
  <img src="https://img.shields.io/badge/Backend-3.9.0-blue.svg" alt="Backend version">
  <img src="https://img.shields.io/badge/Web-1.0.0-2563EB.svg" alt="Web version">
  <img src="https://img.shields.io/badge/Status-Development-orange.svg" alt="Development status">
</p>

## 项目简介

Tutor Platform 提供家教业务的管理后台与客户端代码。仓库包含 Spring Boot 后端、React Web 前端，以及基于 uni-app 的移动端项目。

项目仍在开发中。首次运行前需要自行准备数据库和 Redis，并配置本地环境变量。

## 项目结构

| 目录 | 说明 |
| --- | --- |
| tutor/tutor-admin | Spring Boot 应用入口与管理/API 服务 |
| tutor/tutor-* | 后端 Maven 模块 |
| tutor/tutor-web | React、TypeScript、Vite Web 前端 |
| tutor/tutor-uniapp | Vue 3、uni-app 移动端项目 |
| bin-linux | Linux 启动和部署脚本 |
| docs | 项目文档 |

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 后端 | Java 8、Spring Boot 2.5、Maven |
| Web 前端 | React 18、TypeScript、Vite、pnpm |
| 移动端 | Vue 3、uni-app |
| 数据存储 | MySQL、Redis |

## 环境准备

- JDK 8
- Maven
- Node.js 18 或更高版本，并启用 Corepack
- pnpm 9（由仓库锁文件指定）
- MySQL 和 Redis

当前本地配置默认连接 localhost:3307 上的 tutor 数据库，以及 localhost:6379 上的 Redis；后端监听 12501 端口。

## 配置后端环境变量

后端启动需要数据库账号、Redis 密码和 JWT 密钥。以下值仅为占位符，请在本机替换为自己的配置，不要提交真实凭据：

~~~powershell
$env:DB_USERNAME = "<local-db-user>"
$env:DB_PASSWORD = "<local-db-password>"
$env:REDIS_PASSWORD = "<local-redis-password>"
$env:JWT_SECRET = "<64-character-hex-secret>"
~~~

应用配置注释约定 JWT 密钥使用 64 位十六进制字符串。数据库和 Redis 必须已启动，数据库 schema 也必须已经初始化。

## 构建和运行后端

在仓库根目录执行：

~~~powershell
mvn -f .\tutor\pom.xml -pl tutor-admin -am package
~~~

构建完成后，在同一个 PowerShell 会话设置前述环境变量，然后启动应用：

~~~powershell
java -jar .\tutor\tutor-admin\target\tutor-admin.jar
~~~

## 启动 Web 前端

先启动后端，再在另一个 PowerShell 窗口执行：

~~~powershell
Set-Location D:/tutor-platform/tutor/tutor-web
corepack pnpm install --frozen-lockfile
corepack pnpm dev -- --host 127.0.0.1 --port 12500
~~~

开发服务器把 `/dev-api` 代理到仍在使用的 Java 服务（`VITE_PROXY_TARGET`），把 `/web-api`（客户 Web）和 `/admin-api`（已迁移的管理接口与管理员登录）代理到 Go 服务（`VITE_WEB_API_PROXY_TARGET`、`VITE_ADMIN_API_PROXY_TARGET`）。三个目标默认都指向 127.0.0.1:12501，切分部署时需要分别指定。本地访问地址为 http://127.0.0.1:12500。

构建前端：

~~~powershell
corepack pnpm build
~~~

预览构建结果：

~~~powershell
corepack pnpm preview
~~~

预览服务器默认使用 4173 端口。

## 迁移后的 Go Web API

Web 后端已从 Java + MySQL 迁移到 Go + GORM + PostgreSQL，前端页面保持不变；React 管理台与 H5 客户端的全部请求都发往 Go 服务（构建产物中不含 `/dev-api`、`/prod-api`），Java 后端目前只作为回滚路径保留。Go 服务位于 `tutor/tutor-api`，需要 PostgreSQL 与 Redis：

~~~powershell
Set-Location D:/tutor-platform/tutor/tutor-api
$env:DATABASE_DSN = 'postgres://...'   # 同时需要 JWT_SECRET、REDIS_ADDR、PRIVACY_POLICY_VERSION
go run ./cmd/migrate
go run ./cmd/server
~~~

Linux 部署机上可改用 `bash bin-linux/3b-go-api.sh`（编译 + 迁移 + 探活，配置读 `data/go-api.env`）。

Windows 上双击 `3b-go-api.bat`（等价于上面那条命令）：读同一份 `data\go-api.env`，有 go 工具链就现场编译，先跑迁移再起服务，最后校验 `/health/ready`。常用开关：`-Port 12501`（切到正式端口）、`-SkipBuild`（复用 `runtime\tutor-api.exe`）、`-Stop`（按 pid 文件停止）。未设置 `HTTP_ADDR` 时默认只监听 `127.0.0.1:12502`，日志写 `data\logs\go-api.log`，pid 写 `data\pids\go-api.pid`。`start-all.bat` 检测到 `data\go-api.env` 时会一并拉起它，`stop-all.bat` 会一并停掉。

`data\go-api.env` 含真实的 `DATABASE_DSN` 与 `JWT_SECRET`，已在 `.gitignore` 中排除，不要提交。

配置项、已迁移路由、管理员认证与告知同意/注销流程、数据库与旧 MySQL 数据导入流程见 [tutor/tutor-api/README.md](tutor/tutor-api/README.md)；迁移决策见 `docs/adr`；部署拓扑、端口分配、最小权限数据库账号与切换/回滚步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)；等保与隐私基线见 [docs/SECURITY-BASELINE.md](docs/SECURITY-BASELINE.md) 与 [docs/DATA-PRIVACY.md](docs/DATA-PRIVACY.md)；上线前验收见 `scripts/verify.sh`，已执行过的验证与结果见 [docs/VERIFICATION-RESULTS.md](docs/VERIFICATION-RESULTS.md)。

## 当前限制

- 源码仓库不包含运行时依赖包和预构建产物；相关启动脚本不能单靠全新克隆直接完成部署。
- 仓库目前没有不含业务数据的独立数据库初始化方案。请先准备干净的 schema 和本地数据；不要将真实业务数据或生产凭据提交到仓库。
- Linux 脚本的路径、端口、运行依赖与 Windows 开发步骤不同，部署前需要核对对应脚本和环境配置。

## 待办

优先处理上线前的安全事项、数据库初始化方式和启动脚本的一致性。详细清单见 [TODO.md](TODO.md)。

## 许可证

本项目使用 [MIT License](tutor/LICENSE)。
