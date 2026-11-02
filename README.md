# ANEVER 周承诺

当前飞书妙搭应用的源码镜像。2026-11-02 从线上已发布版本 `d66c30cc2ebab37d5d16e6b26d6024b8d3e2a731` 同步。旧版 Express + Bitable 实现保留在 Git 历史；当前版本为 NestJS + React + 妙搭托管数据库。

## 当前功能

- 伙伴手记启动页，点击按钮后进入本人的个人中心。
- 本人周承诺、历史评级、两个月后的我与未来的我。
- 周里程碑、分组周承诺、周末评级与周一复评。
- 评级隐私、L1 管理入口、申请修改、审核、退回与更正留痕。
- 评论、回复、飞书通知卡片、未读提醒与讨论定位。
- 富文本：加粗、斜体、列表、链接与 Markdown 原文编辑。

## 源码与数据

程序源码与上述线上版本对应，但不包含真实成员愿景、私有手记、文档标题缓存、数据库记录、凭据和私有 Git 历史。公开数据均为演示内容。`SOURCE_SYNC.json` 记录来源版本、源码哈希和适配路径。

**公开副本不能直接覆盖生产应用。** 发布需要保留妙搭环境配置，并恢复生产私有愿景源、手记和资源。详见 [发布边界与机器人接入](docs/feishu-development-agent.md)。

## 开发

使用 Node.js 22+。首次安装用 `npm ci --ignore-scripts`，避免在未配置时自动安装平台插件。

```bash
npm ci --ignore-scripts
npm run type:check
npm run test:rich-text
npm run test:access
npm run build:prod
npm run local:start
```

本地入口 `http://127.0.0.1:8787/`，API `127.0.0.1:8788`。只含虚构管理员与伙伴；本地适配层拦截飞书消息、任务写入和角色变更。`LOCAL_PREVIEW_USER_ID=demo-member` 可用于测试另一身份，只属于本地测试。

私有快照可在工作区外保存并用 `LOCAL_SNAPSHOT_DIR` 指定；不要提交到公开仓库。公开副本使用系统字体回退，生产字体和图片保留于原平台资源存储。

## 飞书开发助手

计划结合 [DeepSeek dsh-superagent 原型](https://github.com/deepseek-ai/dsh-superagent-prototype)，实现“飞书提需求 → 独立任务和分支 → 测试 → PR 与预览 → 本人确认发布”。目前已准备接入说明，**尚未部署或启用开发机器人**；需要专用代理账号、飞书机器人、模型配置与独立运行环境。
