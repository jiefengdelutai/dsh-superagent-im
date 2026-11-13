# 个人 QQ：NapCat / OneBot v11 接入

个人 QQ 通道面向 NapCat 的 OneBot v11 实现：NapCat 通过反向 WebSocket 推送事件，DSH Superagent IM 通过 OneBot HTTP API 回复。

## 风险先知

个人账号自动化不是 QQ 官方机器人能力，可能受平台规则、风控、版本兼容和封号策略影响。请使用专用测试号、小范围测试群和最小权限；不要从主力账号起步。你需要自行确认使用方式符合当地法律、QQ 服务协议和组织规则。

## 配置

### 版本与来源

本项目的独立[源码归档 v4.18.42](https://github.com/jiefengdelutai/NapCatQQ-archive/releases/tag/v4.18.42)固定到提交 `9335843246e3b7a17944861f3ac8731a259732c2`，保留原许可证及版权。该归档仅提供源码，不含可直接安装的 Windows/QQ 原生二进制；不要把源码 ZIP 当作运行包。更换托管账号和核对摘要均不构成安全认证。

运行包需自行确认其来源和再分发授权。本项目不会自动下载或执行 NapCat 安装器。首次启动前将 WebUI host 设为 `127.0.0.1`，使用强随机管理令牌，并设置密码学随机的 `NAPCAT_WEBUI_JWT_SECRET_KEY`。归档版本默认 WebUI 可能监听所有网卡；OneBot 接口启用时必须显式设置 Token。避免使用内置更新器和额外插件，勿把带 Token 的管理链接或日志公开。

### 接入步骤

1. 在独立环境安装并登录 NapCat，先确认它能正常收发消息。
2. 为 OneBot HTTP API 和反向 WebSocket设置同一个高强度 Access Token。
3. 在 Cordis 配置中启用 `dsh-superagent-im-qq-onebot`，重启 DSH。
4. 在面板「设置 → 消息来源」填写机器人 QQ 号、Access Token 和 NapCat HTTP 地址。
5. 默认反向 WebSocket 监听 `127.0.0.1:6700/onebot/v11`。在 NapCat 中把反向 WebSocket 地址设为 `ws://127.0.0.1:6700/onebot/v11`，并发送 `Authorization: Bearer <同一个Token>`。
6. 配置接收的群、私聊开关，并在策略中按 `机器人QQ:用户QQ` 添加能发起工作的用户。

如果 NapCat 与 DSH 不在同一台机器，优先使用受控内网或反向代理的 TLS 终止，不要把监听地址直接暴露到公网。确需改监听地址时，同时配置主机防火墙和来源限制。

## 数据与安全边界

- Access Token 不写入 Trigger、Thread、Channel 地址、Source facts、链接或执行器环境。
- 反向 WebSocket只允许一个已鉴权连接；新连接替换旧连接，超大消息和畸形 JSON 会被拒绝。
- 自身消息、其他登录账号的事件、匿名消息和无法识别身份的消息不会进入任务引擎。
- 图片和文件只保留经过校验的摘要、标识或 HTTP(S) 地址；未知富消息不会执行，只显示安全摘要。
- NapCat、QQ 客户端和本项目的日志都应限制访问并定期清理。

## 停用与排障

在消息来源设置中关闭该 Source，或在 Cordis 中禁用 `dsh-superagent-im-qq-onebot`；同时在 NapCat 中关闭对应反向 WebSocket。

- 连接不上：确认监听地址、端口、路径和 Bearer Token 完全一致；默认监听仅限本机。
- 能收不能回：确认 HTTP 地址可达、HTTP API Token 一致，并检查 NapCat 的 OneBot 响应。
- 群消息被忽略：检查群接收模式、是否要求 @、用户是否在 `机器人QQ:用户QQ` 名单中。
- 出现风控：立即停用自动化，不要通过提高频率或批量重试规避平台限制。

真实账号验收只使用测试号和测试群：验证未授权用户、未 @ 消息、自身回声、断开重连、私聊回复和群回复，再逐步扩大范围。
