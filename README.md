# 空白组谜题设计

空白解谜组（Ku2uhakuAsso）的官方网站。

- 镜像网页(暂时为跳转链接)：[KukuhakuAsso.github.io](https://KukuhakuAsso.github.io)
- 官网：[www.ku2hakuasso.site](https://www.ku2hakuasso.site)

## 项目构成

本项目是 pnpm monorepo，包含一个 VitePress 主站与两个 Git 子模块项目。

### 主站（docs/）

基于 VitePress 构建的静态站点，包含以下页面：

| 页面         | 路径          | 说明                       |
| ------------ | ------------- | -------------------------- |
| 首页         | `/`         | 站点入口                   |
| 博客         | `/blog/`    | 日志                       |
| ARG 谜题档案 | `/puzzles/` | 谜题档案索引               |
| 神秘学论文   | `/lore/`    | 神秘学研究文章             |
| 解谜常用工具 | `/tools/`   | 工具索引                   |
| 文章         | `/posts/`   | 谜题、论文、工具等正文内容 |
| 关于空白     | `/about`    | 组织介绍                   |
| 关注         | `/follow`   | 关注方式                   |

### 子项目（vue-TelemetryInstruments/）

Puzzle解谜游戏「TelemetryInstruments」，Vue 3 + Vite 构建的单页应用，部署在 `/TelemetryInstruments/` 子路径下。

### 子项目（vue-mistarg2anns/）

谜题游戏「mistarg2anns」，Vue 3 + Vite 构建的单页应用，部署在 `/mistarg/2anns/` 子路径下。

这两个目录是独立仓库的 Git 子模块。使用相对 URL 时，fork 主仓库前必须先在同一账号或组织下 fork 同名的
`mistarg2anns` 与 `telemetry-instruments` 仓库，否则执行 `git submodule update --init --recursive` 会因仓库不存在而失败。

## 技术栈

- [VitePress](https://vitepress.dev) 2.x
- Vue 3.5
- Vite 8
- Node.js 22.13+
- pnpm 11+

## 环境要求

- Node.js 22.13 或更高版本
- pnpm（推荐 11 或更高版本）

## 目录结构

```
.
├── .github/workflows/         # CI / 部署工作流
├── docs/                      # VitePress 主站
│   ├── .vitepress/            # 站点配置与自定义主题
│   ├── posts/                 # 文章正文
│   ├── puzzles/ lore/ tools/  # 各栏目索引页
│   └── public/                # 静态资源（图片、PDF 等）
├── vue-TelemetryInstruments/  # 子模块：解谜 SPA
├── vue-mistarg2anns/          # 子模块：谜题游戏
├── scripts/                   # 构建与开发编排脚本
├── projects.json              # 子项目构建配置表
└── dist-preview/              # 构建产物（已 gitignore）
```

## 安装

```bash
pnpm install
```

## 构建方法

| 命令                    | 说明                                            |
| ----------------------- | ----------------------------------------------- |
| `pnpm run dev`        | 并发启动主站与所有子项目的开发服务器            |
| `pnpm run proj:dev`   | 单独启动某个子项目的开发服务器（交互式选择）    |
| `pnpm run docs:dev`   | 仅启动 VitePress 主站开发服务器                 |
| `pnpm run build`      | 构建主站与所有子项目，并合并到`dist-preview/` |
| `pnpm run docs:build` | 仅构建 VitePress 主站                           |
| `pnpm run preview`    | 本地预览`dist-preview/` 构建产物              |

构建时，脚本会根据 `projects.json` 中的 `buildCmd` 字段执行子项目构建；若该命令失败，则回退到默认命令 `pnpm run build`。

## 代码检查与 CI

| 命令                          | 说明                                              |
| ----------------------------- | ------------------------------------------------- |
| `pnpm run lint`             | ESLint + markdownlint 静态检查                     |
| `pnpm run check:projects`   | 检测 `projects.json` 中端口/子路径/代理前缀的冲突 |
| `pnpm run check:links`      | 检查 markdown 中失效的链接与资源                   |
| `pnpm run test`             | 运行所有子项目的单元测试（Node 内置测试运行器）     |
| `pnpm run clean`            | 清理本地临时构建文件；`--all` 连 `dist-preview/` 一并删除 |

- 子项目测试位于各子项目的 `tests/` 目录，`node --test` 会自动发现 `*.test.js`；
- `pnpm run clean -- --dry` 可预览清理项，不真正删除。

### 子模块同步

更新子项目后，在子模块目录提交并推送，再在主仓库执行：

```bash
pnpm run submodules:update
```

该命令会更新子模块指针、刷新根 `pnpm-lock.yaml`，并在有变化时创建本地提交。主仓库的定时 workflow 会检查子模块更新，完成安装和构建验证后创建 PR。

fork 主仓库后，先配置 `upstream`，并确保两个同名子仓库也已 fork，再执行：

```bash
pnpm run fork:sync
```

### CI（GitHub Actions）

- `.github/workflows/ci.yml`：对 `main` 推送与所有 Pull Request 运行 lint、代理冲突检测、链接检查、子项目测试与构建校验；
- `.github/workflows/deploy.yml`：对 `main` 推送（或手动触发）构建并部署——推送到 `dist` 分支供 CVM 拉取，并部署 GitHub Pages 跳转页。

## 新增vite子项目

`projects.json` 是子项目的唯一注册点，主站配置、构建与开发脚本都会自动读取它，无需手动同步。

使用脚手架命令一键创建：

```bash
pnpm run new:project <项目名> [--dir 目录] [--port 端口] [--subpath 子路径] [--proxy 代理前缀,可使用多项]
```

示例：

```bash
pnpm run new:project MyGame --subpath MyGame --proxy api-demo
```

该命令会自动完成：

1. 生成子项目模板（`package.json`、`vite.config.js`、`index.html`、`src/` 等）；
2. 注册到 `projects.json`（端口默认取现有最大端口 + 1）；
3. 注册到 `pnpm-workspace.yaml`。

创建后执行：

```bash
pnpm install    # 安装新子项目的依赖
pnpm run dev    # 主站与所有子项目一起启动
```

说明：

- 子项目的 `vite.config.js` 会自动从 `projects.json` 读取 `base`、`port`、`proxyApi`、`outputDir`，无需手动配置；
- 代理目标通过子项目内的 `.env.development` 配置（模板中为 `API_PROXY_TARGET` / `API_PROXY_REWRITE`）；

`projects.json` 字段说明：

| 字段          | 说明                                     |
| ------------- | ---------------------------------------- |
| `name`      | 项目名                                   |
| `dir`       | 子项目目录名                             |
| `buildCmd`  | 构建命令（失败时回退`pnpm run build`） |
| `outputDir` | 构建产物目录                             |
| `subPath`   | 部署子路径（也是 dev 代理路径）          |
| `devPort`   | 开发服务器端口                           |
| `proxyApi`  | 需要主站转发的代理前缀列表               |
