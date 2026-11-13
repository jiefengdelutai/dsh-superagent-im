# DSH Superagent IM

> **社区项目，非 DeepSeek 官方产品。** 本项目基于 DeepSeek 公开研究原型继续开发，提供多通道任务接入能力。接入真实账号前，请先阅读权限、安全边界与部署说明。

DSH Superagent IM 是运行在 [DeepSeek Harness](https://www.deepseek.com/en/harness/) 中的多通道任务插件。从 GitHub、飞书、QQ 官方机器人或个人 QQ 接收请求，按授权与策略评估需求，创建工单，在独立会话与工作目录中执行，并将结果交付到原始对话。管理面板展示任务状态和需要人工处理的问题。

设计原则是：**尽量减少人工关注，提供可用的执行结果。** 插件只在收到请求或符合团队规则时行动。普通聊天、无权限消息或不符合任务规则的消息不一定触发执行，也不保证回复。

## 安装与配置

### 快速开始

本项目是社区插件，当前按预览版本发布。已在 Windows、DeepSeek Harness 桌面版 `0.2.2-rc.2` 环境验证插件启动、官方 QQ 和个人 QQ 群消息接入及评估；这不代表所有平台与完整 PR 交付场景均已验证。

准备 Node.js `^22.19.0` 或 `>=24.0.0`、pnpm `11.7.0`、Git、GitHub CLI，以及已配置模型的 DeepSeek Harness。安装源码：

```sh
git clone https://github.com/jiefengdelutai/dsh-superagent-im.git
cd dsh-superagent-im
pnpm install --frozen-lockfile
pnpm build
```

在 Harness 的插件管理中添加本地目录；也可以使用 Harness 自带的 `dsh` CLI，为实际使用的 profile 添加 `link:<插件目录绝对路径>`：

```sh
dsh plugin --profile desktop add "link:<插件目录绝对路径>"
```

将占位符替换为本机路径。`desktop` 适用于桌面版默认 profile；其他部署请使用自己的 profile 名称。若 `dsh` 不在 PATH，请使用安装目录内的 CLI。保留源码目录，升级后重新构建并重启 Harness。

打开 Superagent 面板，设置绝对路径的状态目录、目标 GitHub 仓库、已登录的 GitHub CLI、控制者白名单以及执行目录和准备命令。CLI 字段填写 `gh` 或可执行文件的绝对路径，不要填写 `gh repo clone ...` 这样的命令。Windows 准备命令使用 PowerShell，其他系统使用 `sh`。

QQ 接入请分别阅读 [官方机器人](docs/qq-official.md) 或 [个人 QQ / NapCat](docs/qq-onebot.md)，两者可以独立启用。首次验收可在允许的测试群 @账号发送“接入验收，请勿创建工单、修改文件或发起PR”，在面板确认消息进入并完成评估；普通聊天和验收消息不保证回复，也不应自动创建任务。

**权限提示：执行器以当前操作系统用户权限运行，工作目录和会话隔离不等于操作系统沙箱。** 建议使用专用系统账号和 GitHub 账号，先限制到测试仓库与测试群，保持控制者白名单并关闭自动合并。密钥只在本机配置，不要发到聊天、Issue 或提交到 Git。详见 [安全说明](SECURITY.md) 与 [完整部署指南](docs/006-deployment.md)。

安装涉及多个配置项，也可以让编程助手协助。向它发送：

> 阅读本仓库 README.md、SECURITY.md 和 SETUP.md，用中文协助我安装 dsh-superagent-im；如果接入 QQ，同时阅读对应的 QQ 接入指南。不要让我在聊天中提供密钥。

首次使用建议先在测试仓库和测试群验收，再扩大授权范围。[SETUP.md](SETUP.md) 是原型沿用的助手部署流程参考，部分步骤面向 Unix 环境；Windows 用户以本文及 QQ 中文指南为入口，不要直接照搬其中的 shell 脚本。

## 文档导航

用户接入文档使用中文。以下原型技术文档目前保留英文，按编号阅读可逐步了解内部机制：

- [000 设计理念](docs/000-philosophy.md)
- [001 领域模型](docs/001-domain.md)
- [002 授权机制](docs/002-authorization.md)
- [003 执行机制](docs/003-execution.md)
- [004 提示词](docs/004-prompts.md)
- [005 管理面板](docs/005-panel.md)
- [006 部署、升级与排障](docs/006-deployment.md)
- [007 项目架构](docs/007-architecture.md)
- [008 扩展消息来源](docs/008-cookbook.md)

QQ 提供两条相互独立的接入路径：

- [QQ 官方机器人](docs/qq-official.md)：适合正式群机器人和私聊机器人，使用 QQ 开放平台身份。
- [个人 QQ（NapCat / OneBot v11）](docs/qq-onebot.md)：适合个人 QQ 号，存在账号风控和非官方协议风险。

两种通道可以同时启用，但 OpenID 与数字 QQ 号不会互相映射。无凭据的插件启用示例见 [examples/qq.cordis.patch.yml](examples/qq.cordis.patch.yml)。

## 开发与验证

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm check` 依次执行类型检查、完整测试和构建。当前类型检查、构建及相关 QQ / Windows 测试已通过，但本机 Windows 完整测试仍有 Unix 命令、符号链接权限和脚本兼容问题，尚未获得完整套件全部通过的结果；本项目仍处于预览阶段。

报告问题时，请说明操作系统、Harness 与 Node 版本、来源类型和复现步骤。只提供脱敏日志，不上传密钥、登录缓存、二维码或聊天记录。参见 [安全说明](SECURITY.md)。

## 来源与许可证

本插件沿用 [MIT 许可证](LICENSE)，保留原型的版权声明。本次公开仓库由 `jiefengdelutai` 维护；新的提交历史不改变原始代码的版权归属。

NapCat 是独立可选依赖，不包含在本插件内，适用其自身许可证。[NapCat 固定源码归档](https://github.com/jiefengdelutai/NapCatQQ-archive/releases/tag/v4.18.42)仅用于保留来源，不代表通过安全认证，也不提供 Windows 原生运行包。
