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

被禁用的仓库在 `dev`、`build`、`proj:dev`、`test`、`check:projects` 中一律跳过（不启动开发服务器、不构建、不测试、不检查）；子模块同步命令 `fork:sync`、`fork:pr`、`submodules:update` 也会跳过被禁用的子模块（不检查/不创建其 fork、不同步、不提交 PR），主仓库不受影响。`proj:dev` 直接指定被禁用的项目名时会给出提示并退出。

交互流程中如果对某个子项目选择「否」，会自动把该项目写入 `.repos.local.json`（`dev` / `build` / `proj:dev` 询问「是否初始化子模块」时选 `n`，或 `fork:sync` 询问「是否创建子仓库 fork」时选 `n`），后续所有命令都会跳过它；需要时手动从配置的 `disabled` 列表中移除即可恢复。`--no-init` / `--no-create` 旗标与 CI 环境不会改写配置文件。文件不存在或格式错误时按「全部启用」处理，不影响任何脚本。

构建时，脚本会根据 `projects.json` 中的 `buildCmd` 字段执行子项目构建；若该命令失败，则回退到默认命令 `pnpm run build`。

> `preview:upstream` 用于预览上游（`upstream/dist` 分支）已部署的构建产物：脚本会 `git fetch upstream dist`，在临时目录创建该分支的 worktree，将其内容拷贝到 `dist-preview/` 后启动 `vite preview`，退出时自动清理临时 worktree。适用于在本地核对 CVM 上拉取到的实际部署内容。

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

主仓库 fork 工作流涉及的命令：

| 命令                            | 说明                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `pnpm run submodules:update`  | 更新子模块指针并自动 push 全部子模块与主仓库到 fork          |
| `pnpm run fork:sync`          | 检查/创建缺失 fork，从 upstream 拉取并同步子模块与远程配置    |
| `pnpm run fork:token`         | 把创建 fork 用的最小权限 PAT 存入 Windows 凭据管理器          |
| `pnpm run fork:pr`            | 比较 fork 与 upstream 差异，打开 PR 创建页面（默认无需 PAT）  |

更新子项目后，在子模块目录提交并推送，再在主仓库执行：

```bash
pnpm run submodules:update
```

该命令会更新子模块指针、刷新根 `pnpm-lock.yaml`，并在有变化时创建本地提交；完成后会自动把主仓库推送到 `origin`（fork），保证后续 `fork:pr` 能拿到完整差异，不会因提交未推送而缺失内容或失效。主仓库的定时 workflow 会检查子模块更新，完成安装和构建验证后创建 PR。

执行前脚本会检查主仓库的 `origin` 确实指向 fork，且各子模块的 `origin` 与主仓库属于同一账号或组织；检查不通过时会停止，避免把子项目提交到上游或错误的远程。成功执行后会记录本地同步状态，`fork:pr` 会要求这条状态存在。

fork 主仓库后，先配置 `upstream`，再执行：

```bash
pnpm run fork:sync
```

该命令会先检查 GitHub 上是否存在对应的主 fork 与同名子仓库 fork，缺少时询问是否创建；结束后会保证主仓库与各子模块的 `upstream` 远程地址正确。

如果远程 fork 已经存在，`fork:sync` 的拉取、子模块初始化和远程配置不需要 PAT；只有需要通过 GitHub API 自动创建缺失 fork 时才需要 Token。创建仓库使用最小权限 PAT（`repo` 权限即可，建议设置到期时间），存放在 Windows 凭据管理器中静默读取；

```bash
pnpm run fork:token   # 把 PAT 存入 Windows 凭据管理器
pnpm run fork:sync
pnpm run fork:sync -- --no-create  # 不创建缺失 fork，无 PAT 执行同步部分
```

- `--yes`：跳过询问，直接创建所有缺失的 fork；
- `--no-submodules`：跳过子仓库 fork 的检查与创建；
- `--no-sync`：只处理仓库创建，不执行 pull / submodule update；
- `--no-create`：不创建任何 fork；适合已有 fork、希望完全无 PAT 运行同步的情况；
- 也兼容 `GITHUB_TOKEN` / `GH_TOKEN` 环境变量与已登录的 gh CLI。

### 提交 PR（fork:pr）

`fork:sync` 只负责拉取上游，不会提交 PR。当子仓库或主仓库有领先 `upstream` 的提交需要合回上游时，用 `fork:pr` 一键为这些仓库创建 PR：

```bash
pnpm run fork:pr                 # 无 PAT，打开页面后手动确认创建
pnpm run fork:pr -- --api        # 使用 Token，通过 API 创建
pnpm run fork:pr -- --api --yes  # API 模式跳过确认，直接创建
pnpm run fork:pr -- --dry-run    # 只报告将创建哪些 PR，不调用接口
```

`fork:pr` 默认会在执行前自动先运行 `pnpm run submodules:update`，确保子模块与主仓库已同步并推送到 fork，差异才完整（可用 `--skip-update` 跳过；`--dry-run` 为只读预览，不会自动同步）。默认情况下 `fork:pr` 不使用 PAT，只打开 GitHub compare 页面；可在浏览器中，或使用 VS Code 的 GitHub Pull Requests 插件登录后手动确认创建 PR。若需要由脚本直接调用 GitHub API，显式添加 `--api`，此时才会读取 `fork:token`、`GITHUB_TOKEN`、`GH_TOKEN` 或 `gh auth token`。

该命令会 fetch 主仓库与各子模块的 `origin`/`upstream`，比较 `upstream/<base>..origin/<head>`（默认 `main` → `main`），为「fork 领先 upstream」的仓库创建 PR，并自动跳过已存在相同 head 的 open PR；PR 标题默认取领先提交中第一条的标题，正文列出全部领先提交。

常用选项：

- `--yes` / `-y`：`--api` 模式跳过确认，直接创建所有需要的 PR；
- `--main`：只处理主仓库，不处理子模块；
- `--repo <dir>`：只处理指定仓库（主仓库用 `.`，子模块用目录名），可多次指定；
- `--head <branch>` / `--base <branch>`：fork 侧 / upstream 侧分支（默认 `main`）；
- `--title <t>` / `--body <b>`：覆盖 PR 标题 / 说明（默认取自领先提交）；
- `--draft`：创建为 draft PR；
- `--dry-run`：只报告将创建哪些 PR，不实际调用接口。
- `--skip-update`：跳过执行前的 `submodules:update`（默认会自动先同步）；
- `--api`：使用 GitHub API 自动创建 PR，需要 PAT 或 `gh` token；默认不开启。

创建 PR 的默认手动流程不需要 PAT，GitHub 会在浏览器或 VS Code 插件中完成登录和权限确认；`--api` 自动流程才需要 Token。这个 Token 不需要是上游仓库所有者的 Token，而是发起 PR 的 GitHub 账号自己的凭据，并且必须对目标上游仓库拥有创建 Pull Request 的权限（fine-grained token 通常需要目标仓库的 `Pull requests: Read and write`，经典 token 通常需要相应的 `repo` 权限并通过组织 SSO/策略）。上游所有者不需要把自己的 PAT 提供给 fork 用户。若 fork 侧分支尚未推送（本地领先 `origin`），脚本会给出提示，因为 PR 只会包含已推到 fork 的提交。

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

- 若 `--url` 使用相对 URL（如 `../mygame.git`），`git submodule add` 会基于主仓库的远程地址自动解析，fork 主仓库前必须先在同一账号或组织下 fork 同名子仓库；
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
