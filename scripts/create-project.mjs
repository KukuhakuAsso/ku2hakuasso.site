// scripts/create-project.mjs
// 以子模块方式接入新的子项目：生成独立仓库模板 → 推送到远程 → git submodule add → 注册
// 也支持 --local 本地临时子模块模式：本地生成独立仓库并挂载为子模块，不推送到远程。
// 用法:
//   node scripts/create-project.mjs <项目名> --url <远程仓库URL> [--dir <目录>] [--port <端口>] [--subpath <子路径>] [--proxy <前缀,可多次>]
//   node scripts/create-project.mjs <项目名> --local [--url <仓库URL>] [--dir <目录>] [--port <端口>] [--subpath <子路径>] [--proxy <前缀,可多次>]
// 示例:
//   node scripts/create-project.mjs MyGame --url git@github.com:user/mygame.git --subpath MyGame --proxy /api-mygame
//   node scripts/create-project.mjs MyGame --local --subpath MyGame --proxy /api-mygame
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TEMPLATE_DIR = path.join(__dirname, "templates", "subproject");

// ---------- 路径归一化（兼容 cmd / PowerShell / Git Bash 的 MSYS 路径转换） ----------

let msysRoot = null;

// 获取 MSYS（Git Bash）根目录，如 C:/Program Files/Git
function getMsysRoot() {
    if (msysRoot !== null) return msysRoot;
    if (!process.env.MSYSTEM) {
        msysRoot = "";
        return msysRoot;
    }
    try {
        const out = execFileSync("cygpath", ["-m", "/"], {
            encoding: "utf-8",
            windowsHide: true,
        }).trim();
        msysRoot = out.replace(/\\/g, "/").replace(/\/+$/, "");
    } catch {
        msysRoot = "";
    }
    return msysRoot;
}

// 归一化 URL 前缀：/api-demo 在 cmd/PowerShell 原样传入；
// 在 Git Bash 中会被转成 C:/Program Files/Git/api-demo，这里还原为 /api-demo
function normalizeUrlPrefix(raw) {
    let v = String(raw).trim().replace(/\\/g, "/");
    if (v.startsWith("/")) return v.replace(/\/+$/, "") || "/";

    if (/^[A-Za-z]:\//.test(v)) {
        const root = getMsysRoot();
        if (root && v.toLowerCase().startsWith(root.toLowerCase() + "/")) {
            return "/" + v.slice(root.length + 1);
        }
        // 兜底：取最后一个名为 git 的目录之后的部分
        const segs = v.slice(v.indexOf("/") + 1).split("/");
        let gitIdx = -1;
        for (let i = 0; i < segs.length; i++) {
            if (/^git$/i.test(segs[i])) gitIdx = i;
        }
        if (gitIdx >= 0 && gitIdx < segs.length - 1) {
            return "/" + segs.slice(gitIdx + 1).join("/");
        }
    }
    return "/" + v;
}

// 归一化子路径：去掉前后斜杠，兼容 MSYS 转换
function normalizeSubPath(raw) {
    let v = String(raw).trim().replace(/\\/g, "/");
    if (/^[A-Za-z]:\//.test(v)) {
        const root = getMsysRoot();
        if (root && v.toLowerCase().startsWith(root.toLowerCase() + "/")) {
            v = v.slice(root.length + 1);
        } else {
            const segs = v.slice(v.indexOf("/") + 1).split("/");
            let gitIdx = -1;
            for (let i = 0; i < segs.length; i++) {
                if (/^git$/i.test(segs[i])) gitIdx = i;
            }
            if (gitIdx >= 0 && gitIdx < segs.length - 1) {
                v = segs.slice(gitIdx + 1).join("/");
            }
        }
    }
    return v.replace(/^\/+|\/+$/g, "");
}

// ---------- 参数解析 ----------
function parseArgs(argv) {
    const name = argv[0];
    if (!name) {
        console.error(
            "用法: node scripts/create-project.mjs <项目名> [--url <远程仓库URL> | --local] [--dir <目录>] [--port <端口>] [--subpath <子路径>] [--proxy <前缀,可多次>]",
        );
        process.exit(1);
    }
    const opts = { name, dir: name, port: undefined, subpath: name, proxy: [], url: undefined, local: false };
    for (let i = 1; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--local") {
            opts.local = true;
            continue;
        }
        const keys = ["--dir", "--port", "--subpath", "--proxy", "--url"];
        if (keys.includes(a) && argv[i + 1]) {
            const v = argv[++i];
            if (a === "--dir") opts.dir = v;
            else if (a === "--port") opts.port = Number(v);
            else if (a === "--subpath") opts.subpath = normalizeSubPath(v);
            else if (a === "--proxy") opts.proxy.push(normalizeUrlPrefix(v));
            else opts.url = v;
        }
    }
    return opts;
}

// ---------- 在指定目录执行 git 命令 ----------
function runGit(args, cwd) {
    execFileSync("git", args, { cwd, stdio: "inherit", windowsHide: true });
}

// 改写 .gitmodules 中指定 path 的 url（本地子模块挂载后，把临时路径替换为目标 URL）
function setSubmoduleUrl(dir, url) {
    const file = path.join(ROOT, ".gitmodules");
    const lines = fs.readFileSync(file, "utf-8").split("\n");
    let inTarget = false;
    const out = [];
    for (const line of lines) {
        const isSection = /^\s*\[submodule /.test(line);
        if (isSection) {
            inTarget = line.includes(`"${dir}"`);
        } else if (inTarget && /^\s*url\s*=/.test(line)) {
            out.push(`\turl = ${url}`);
            continue;
        }
        out.push(line);
    }
    fs.writeFileSync(file, out.join("\n"));
    console.log(`[完成] 已设置子模块 URL: ${url}`);
}

// ---------- 读取现有 projects.json ----------
function loadProjects() {
    return JSON.parse(
        fs.readFileSync(path.join(ROOT, "projects.json"), "utf-8"),
    );
}

// 默认端口 = 现有最大 devPort + 1，自动避免冲突
function nextPort(projects) {
    return projects.reduce((m, p) => Math.max(m, p.devPort || 0), 5174) + 1;
}

// ---------- 注册到 projects.json ----------
function registerProject(entry) {
    const file = path.join(ROOT, "projects.json");
    const projects = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (projects.some((p) => p.dir === entry.dir)) {
        console.log(`[跳过] projects.json 已存在 dir=${entry.dir}`);
        return;
    }
    projects.push({ enabled: true, ...entry });
    fs.writeFileSync(file, JSON.stringify(projects, null, 4) + "\n");
    console.log(`[完成] 已注册到 projects.json: ${entry.name}`);
}

// ---------- 注册到 pnpm-workspace.yaml ----------
function registerWorkspace(dir) {
    const file = path.join(ROOT, "pnpm-workspace.yaml");
    const text = fs.readFileSync(file, "utf-8");
    if (text.includes(`'${dir}'`)) {
        console.log(`[跳过] pnpm-workspace.yaml 已存在 ${dir}`);
        return;
    }
    const lines = text.split("\n");
    const pkgIdx = lines.findIndex((l) => l.trim() === "packages:");
    let insertIdx = lines.length;
    for (let i = pkgIdx + 1; i < lines.length; i++) {
        if (/^\S/.test(lines[i])) {
            insertIdx = i;
            break;
        }
    }
    lines.splice(insertIdx, 0, `  - '${dir}'`);
    fs.writeFileSync(file, lines.join("\n"));
    console.log(`[完成] 已加入 pnpm-workspace.yaml: ${dir}`);
}

// ---------- 生成模板文件 ----------
function render(content, vars) {
    return content.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ""));
}

function copyTemplate(targetDir, vars) {
    const walk = (src, dst) => {
        for (const entry of fs.readdirSync(src)) {
            const s = path.join(src, entry);
            const d = path.join(dst, entry);
            if (fs.statSync(s).isDirectory()) {
                fs.mkdirSync(d, { recursive: true });
                walk(s, d);
            } else {
                fs.writeFileSync(d, render(fs.readFileSync(s, "utf-8"), vars));
            }
        }
    };
    fs.mkdirSync(targetDir, { recursive: true });
    walk(TEMPLATE_DIR, targetDir);
}

// ---------- 主流程 ----------
function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.local && !opts.url) {
        console.error(
            "用法: node scripts/create-project.mjs <项目名> [--url <远程仓库URL> | --local] [--dir <目录>] [--port <端口>] [--subpath <子路径>] [--proxy <前缀,可多次>]",
        );
        console.error("  --url    正式接入：生成独立仓库 → 推送到远程 → git submodule add（需先创建空远程仓库）");
        console.error("  --local  本地临时：直接在主仓库内生成目录并注册，不推送、不挂子模块");
        process.exit(1);
    }

    const projects = loadProjects();
    const port = opts.port ?? nextPort(projects);

    const targetDir = path.resolve(ROOT, opts.dir);
    if (fs.existsSync(targetDir)) {
        console.error(`[错误] 目录已存在: ${opts.dir}`);
        process.exit(1);
    }

    // ---------- 本地临时子模块模式 ----------
    if (opts.local) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "new-project-"));
        console.log(`📦 正在本地生成独立仓库: ${opts.name}`);
        try {
            copyTemplate(tmpDir, { name: opts.name, subpath: opts.subpath, port: String(port) });
            runGit(["init"], tmpDir);
            runGit(["branch", "-M", "main"], tmpDir);
            runGit(["add", "."], tmpDir);
            runGit(["commit", "-m", `chore: init ${opts.name}`], tmpDir);

            // 用本地路径挂载为子模块（无需远程仓库存在）
            // Git 默认禁止 file 协议，需显式允许
            const localPath = tmpDir.replace(/\\/g, "/");
            console.log(`🔗 挂载本地子模块: ${opts.dir}`);
            runGit(["-c", "protocol.file.allow=always", "submodule", "add", "-b", "main", localPath, opts.dir], ROOT);
        } catch {
            console.error("\n❌ 本地子模块创建失败。");
            process.exit(1);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }

        // 将 .gitmodules 的 url 改写为目标远程地址（本地开发不受影响，后续可直接推送）
        const submoduleUrl = opts.url || `../${opts.name}.git`;
        setSubmoduleUrl(opts.dir, submoduleUrl);
        runGit(["submodule", "sync"], ROOT);

        registerProject({
            name: opts.name,
            dir: opts.dir,
            buildCmd: "pnpm run build",
            outputDir: "output",
            subPath: opts.subpath,
            devPort: port,
            proxyApi: opts.proxy,
        });
        registerWorkspace(opts.dir);

        console.log("");
        console.log(`本地临时子模块已创建: ${opts.dir}`);
        console.log(`  端口: ${port}  子路径: /${opts.subpath}/`);
        console.log(`  .gitmodules URL: ${submoduleUrl}（本地可用，尚未推送远程）`);
        console.log("⚠️  子模块仅存在于本地；正式接入时：先创建远程仓库，再在子模块目录推送，最后提交主仓库的 gitlink。");
        console.log("下一步:");
        console.log("  1. pnpm install");
        console.log("  2. pnpm run dev   # 主站开发服务器会自动代理该子项目");
        return;
    }

    // ---------- 子模块模式 ----------
    // 1. 在临时目录生成独立仓库模板，初始化 git 并推送到远程
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "new-project-"));
    console.log(`📦 正在生成独立仓库模板: ${opts.name}`);
    try {
        copyTemplate(tmpDir, { name: opts.name, subpath: opts.subpath, port: String(port) });
        runGit(["init"], tmpDir);
        runGit(["branch", "-M", "main"], tmpDir);
        runGit(["add", "."], tmpDir);
        runGit(["commit", "-m", `chore: init ${opts.name}`], tmpDir);
        runGit(["remote", "add", "origin", opts.url], tmpDir);
        console.log(`🚀 推送初始提交到: ${opts.url}`);
        runGit(["push", "-u", "origin", "main"], tmpDir);
    } catch {
        console.error("\n❌ 独立仓库生成/推送失败。");
        console.error("   请确认已先在远程创建空仓库，且本机具备该仓库的推送权限。");
        process.exit(1);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 2. 在主仓库添加为子模块（与现有子模块一致，branch 指向 main）
    console.log(`🔗 添加子模块: ${opts.dir} -> ${opts.url}`);
    try {
        runGit(["submodule", "add", "-b", "main", opts.url, opts.dir], ROOT);
    } catch {
        console.error("\n❌ 添加子模块失败，请检查远程仓库可访问性。");
        process.exit(1);
    }

    // 3. 注册到 projects.json 与 pnpm-workspace.yaml
    registerProject({
        name: opts.name,
        dir: opts.dir,
        buildCmd: "pnpm run build",
        outputDir: "output",
        subPath: opts.subpath,
        devPort: port,
        proxyApi: opts.proxy,
    });
    registerWorkspace(opts.dir);

    console.log("");
    console.log(`新子项目已以子模块方式接入: ${opts.dir}`);
    console.log(`  端口: ${port}  子路径: /${opts.subpath}/  远程: ${opts.url}`);
    console.log("下一步:");
    console.log("  1. git add .gitmodules projects.json pnpm-workspace.yaml");
    console.log(`  2. git commit -m "chore: add subproject ${opts.name}"`);
    console.log("  3. pnpm install");
    console.log("  4. pnpm run dev   # 主站开发服务器会自动代理该子项目");
}

main();
