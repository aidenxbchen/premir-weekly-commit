# 飞书开发机器人接入方案

目标：在飞书向机器人提出 ANEVER 的修改需求，查看 PR 与预览，确认具体提交后发布妙搭。**本文是接入设计，不代表机器人已启用。**

## 已核验的上游能力

[DeepSeek dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) 能监听 GitHub、指定飞书群的 @ 和私信，把授权请求转成 Ticket，在独立 Session/目录执行，再回复原讨论并返回 PR。它依赖 DeepSeek Harness，不是装进妙搭的前端组件。

依据：[部署文档](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md)、[权限模型](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/002-authorization.md)、[SETUP](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/SETUP.md)。上游 README 明确它是研究原型；妙搭发布与预览适配尚需实现。

## 工作流程

1. 受信任操作者在指定飞书开发群 @机器人或私信提出需求。
2. 校验请求身份，为需求创建 Ticket 和独立分支；编码、检查均使用演示数据。
3. 回传变更说明、PR、测试结果与真实预览地址；操作者在原讨论继续调整。
4. 操作者明确确认项目、PR 和具体提交 SHA。确认旧 SHA、引用的“发布”、代理自己的消息均不能触发上线。
5. 发布适配器在私有妙搭检出中应用已确认的功能差异，核对生产版本与覆盖层，再检查、推送 sprint/default。
6. release-create 后查询同一次 release-get，只有 finished 且 commit_id 一致才回复成功。

初期第 5–6 步由受信任操作者执行。自动发布适配器未完成前，机器人只能交付 PR，不得宣称已发布。

## 账号与主机

- 专用 GitHub 用户账号获得本仓库写入权限，使用独立 gh 配置。上游依赖用户 notifications，不能以 GitHub App 代替该账号。
- 独立飞书开发机器人，配置 bot-only 的 lark-cli。不可共享日常个人登录凭据给编码任务。
- 独立 Harness profile，例如 superagent；不要替换现有日常 profile。长期运行建议独立 OS 账号或服务器，上游执行器拥有所在 OS 用户的完整文件权限。
- 模型配置及密钥在仓库外设置，不在聊天或 GitHub 中传递。
- 初期只允许操作者提需求，关闭自动合并，主动任务用 observe。

2026-11-02 本机核验：Node.js 22.23.2、pnpm、Git、Python、lark-cli 存在；Harness 为 0.1.1-rc.2，而上游要求 engines.dsh ^0.2.1-alpha.2。本次同步已安装并校验官方 GitHub CLI 2.103.3，等待操作者完成登录；tmux 和 dsh-superagent 尚未配置。需要确定运行主机、代理账号、开发群、授权人员和模型提供方后再安装配置。

## 私有覆盖层

| 路径或资源 | GitHub 公开内容 | 发布时保留的生产内容 |
|---|---|---|
| server/modules/personal-vision/source.ts | 空来源列表 | 真实身份映射和个人愿景 |
| content/ 下的手记 | 虚构示例 | 私有 Markdown 原文 |
| client/public/sketchbook/ | 原交互、示例书页 | 原生产 HTML 与平台书页 |
| client/src/index.css 的字体 | 系统字体回退 | 应用的私有字体资源 |
| local 数据与文档标题缓存 | 空数据或虚构示例 | 私有快照或妙搭数据库 |
| .env 与模型/机器人配置 | 仅变量示例 | 私有运行环境 |

公开副本不能作为完整目录覆盖生产。发布须在私有检出应用公共功能差异，并对当前线上数据库做只读核对。

## 验收场景

- 未授权者不能创建编码任务；引用内容不改变授权。
- 消息重试不重复开任务；后续调整关联正确 Ticket。
- 预览与四项项目检查在不接触生产数据时完成。
- 未确认、旧 SHA 或伪造确认都不能发布。
- 生产版本并发变化时停止旧提交的发布并提示，从不 force push。
- 发布/通知失败、服务重启后可查原 Ticket 与 release，不重复发布。
- 首次由操作者发起一条小范围需求，实测完整闭环后，才能宣布接入完成。
