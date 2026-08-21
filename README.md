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

这两个目录是独立仓库的 Git 子模块，使用相对 URL 指向同组织下的
`mistarg2anns` 与 `telemetry-instruments` 仓库，直接克隆后执行 `git submodule update --init --recursive` 即可。

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

| 命令                          | 说明                                                         |
| ----------------------------- | ------------------------------------------------------------ |
| `pnpm run dev`              | 并发启动主站与所有子项目的开发服务器                         |
| `pnpm run proj:dev`         | 单独启动某个子项目的开发服务器（交互式选择）                 |
| `pnpm run docs:dev`         | 仅启动 VitePress 主站开发服务器                              |
| `pnpm run build`            | 构建主站与所有子项目，并合并到`dist-preview/`              |
| `pnpm run docs:build`       | 仅构建 VitePress 主站                                        |
| `pnpm run preview`          | 本地预览`dist-preview/` 构建产物                           |
| `pnpm run preview:upstream` | 拉取`upstream/dist` 构建产物到`dist-preview/` 并本地预览 |

> `dev` / `proj:dev` / `build` 启动前会自动检测 `projects.json` 中未初始化的 Git 子模块（`git submodule status` 显示 `-` 前缀或目录缺失）：交互环境下逐项询问是否执行 `git submodule update --init`，选择「否」的子项目会被跳过、不会拉起或构建（主站不受影响）；非交互环境（如 CI）默认跳过并告警。
>
> - `pnpm run dev -- --yes`：检测到未初始化时直接初始化，不再询问；
> - `pnpm run dev -- --no-init`：直接跳过，不再询问（`build` / `proj:dev` 同样支持这两个旗标）。

### 个人本地配置：选择性禁用部分仓库

如果只想开发/构建部分仓库（主站或某个子项目），可以编辑根目录下的 `.repos.local.json`（已加入 `.gitignore`，只影响本机，不会提交）：

```json
{
    "disabled": ["main", "vue-TelemetryInstruments"]
}
```

- `"main"` 表示禁用主站（VitePress 主项目）；
- 其余条目按 `projects.json` 中子项目的 `name` 或 `dir` 匹配（如 `"TelemetryInstruments"` 或 `"vue-TelemetryInstruments"`）。

被禁用的仓库在 `dev`、`build`、`proj:dev`、`test`、`check:projects` 中一律跳过（不启动开发服务器、不构建、不测试、不检查）；子模块同步命令 `submodules:update` 也会跳过被禁用的子模块（不同步），主仓库不受影响。`proj:dev` 直接指定被禁用的项目名时会给出提示并退出。

交互流程中如果对某个子项目选择「否」，会自动把该项目写入 `.repos.local.json`（`dev` / `build` / `proj:dev` 询问「是否初始化子模块」时选 `n`），后续所有命令都会跳过它；需要时手动从配置的 `disabled` 列表中移除即可恢复。`--no-init` 旗标与 CI 环境不会改写配置文件。文件不存在或格式错误时按「全部启用」处理，不影响任何脚本。

构建时，脚本会根据 `projects.json` 中的 `buildCmd` 字段执行子项目构建；若该命令失败，则回退到默认命令 `pnpm run build`。

> `preview:upstream` 用于预览 `origin/dist` 分支已部署的构建产物：脚本会 `git fetch origin dist`，在临时目录创建该分支的 worktree，将其内容拷贝到 `dist-preview/` 后启动 `vite preview`，退出时自动清理临时 worktree。适用于在本地核对 CVM 上拉取到的实际部署内容。

## 代码检查与 CI

| 命令                        | 说明                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `pnpm run lint`           | ESLint + markdownlint 静态检查                                |
| `pnpm run check:projects` | 检测`projects.json` 中端口/子路径/代理前缀的冲突            |
| `pnpm run check:links`    | 检查 markdown 中失效的链接与资源                              |
| `pnpm run test`           | 运行所有子项目的单元测试（Node 内置测试运行器）               |
| `pnpm run clean`          | 清理本地临时构建文件；`--all` 连 `dist-preview/` 一并删除 |

- 子项目测试位于各子项目的 `tests/` 目录，`node --test` 会自动发现 `*.test.js`；
- `pnpm run clean -- --dry` 可预览清理项，不真正删除。

## 子模块同步

仓库已改为直接管理上游（`origin` 即 `KukuhakuAsso/*` 本体），不再使用 fork 工作流，提交直接推送到 `origin`：

| 命令                            | 说明                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `pnpm run submodules:update`  | 更新子模块指针并自动 push 全部子模块与主仓库到 origin（上游）|

更新子项目后，在子模块目录提交并推送，再在主仓库执行：

```bash
pnpm run submodules:update
```

该命令会更新子模块指针、刷新根 `pnpm-lock.yaml`，并在有变化时创建本地提交；完成后会自动推送子模块与主仓库到各自的 `origin`。主仓库的定时 workflow（`.github/workflows/sync-submodules.yml`）会检查子模块更新，完成安装和构建验证后创建 PR。

## CI（GitHub Actions）

- `.github/workflows/ci.yml`：对 `main` 推送与所有 Pull Request 运行 lint、代理冲突检测、链接检查、子项目测试与构建校验；
- `.github/workflows/deploy.yml`：对 `main` 推送（或手动触发）构建并部署——推送到 `dist` 分支供 CVM 拉取，并部署 GitHub Pages 跳转页。

## 新增vite子项目

新增子项目必须以 **Git 子模块**方式接入：先在远程（如 GitHub）创建好独立的空仓库，再通过脚手架生成独立仓库并挂载为子模块，**不允许直接在主仓库内创建项目目录**（本地临时开发除外，见下方 `--local`）。

`projects.json` 是子项目的唯一注册点，主站配置、构建与开发脚本都会自动读取它，无需手动同步。

### 正式接入（子模块）

使用脚手架命令一键完成（生成独立仓库 → 推送远程 → 添加子模块 → 注册）：

```bash
pnpm run new:project <项目名> --url <远程仓库URL> [--dir 目录] [--port 端口] [--subpath 子路径] [--proxy 代理前缀,可使用多项]
```

示例：

```bash
pnpm run new:project MyGame --url git@github.com:KukuhakuAsso/mygame.git --subpath MyGame --proxy api-demo
```

> 执行前请先在远程创建好**空的独立仓库**（建议放在与主仓库相同的账号/组织下，便于使用相对 URL），并确保本机有该仓库的推送权限。

该命令会自动完成：

1. 在临时目录生成子项目模板（`package.json`、`vite.config.js`、`index.html`、`src/` 等），初始化 git 并推送到 `--url` 指定的远程仓库；
2. 在主仓库执行 `git submodule add`，将该远程仓库挂载为子模块；
3. 注册到 `projects.json`（端口默认取现有最大端口 + 1）；
4. 注册到 `pnpm-workspace.yaml`。

创建后执行：

```bash
git add .gitmodules projects.json pnpm-workspace.yaml
git commit -m "chore: add subproject MyGame"
pnpm install    # 安装新子项目的依赖
pnpm run dev    # 主站与所有子项目一起启动
```

### 本地临时子模块（--local）

仅用于本地开发/预览，在本地生成独立仓库并挂载为子模块，**不推送远程、不要求远程仓库存在**：

```bash
pnpm run new:project <项目名> --local [--url 仓库URL] [--dir 目录] [--port 端口] [--subpath 子路径] [--proxy 代理前缀,可使用多项]
```

示例：

```bash
pnpm run new:project MyGame --local --subpath MyGame
```

该命令会自动完成：

1. 在临时目录生成独立仓库模板并提交本地 commit；
2. 用本地路径执行 `git submodule add`，将该仓库挂载为子模块；
3. 将 `.gitmodules` 中的 url 改写为 `--url`（缺省为 `../<项目名>.git`）；
4. 注册到 `projects.json` 与 `pnpm-workspace.yaml`。

注意事项：

- 子模块仅存在于本地，`--url` 可以指向尚不存在的远程仓库，正式接入时只需在子模块目录推送即可；
- 注册逻辑（`projects.json` / `pnpm-workspace.yaml`）与正式模式一致，`pnpm install` + `pnpm run dev` 即可本地联调；
- 若需删除，直接移除目录并从 `projects.json` / `pnpm-workspace.yaml` / `.gitmodules` 中清理对应条目。

说明：

- 若 `--url` 使用相对 URL（如 `../mygame.git`），`git submodule add` 会基于主仓库的远程地址自动解析出同账号/组织下的子仓库地址；
- 子项目的 `vite.config.js` 会自动从 `projects.json` 读取 `base`、`port`、`proxyApi`、`outputDir`，无需手动配置；
- 代理目标通过子项目内的 `.env.development` 配置（模板中为 `API_PROXY_TARGET` / `API_PROXY_REWRITE`）；
- 子模块内部更新后，在主仓库执行 `pnpm run submodules:update` 同步子模块指针（见上文「子模块同步」）。

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
| `enabled`   | 生产环境是否启用（缺省为`true`）。设为`false`时，`pnpm run build`（生产构建，CI 部署也走此命令）会跳过该子项目，不构建、不合并到 `dist-preview`；本地 `dev` / `proj:dev` 不受影响 |
