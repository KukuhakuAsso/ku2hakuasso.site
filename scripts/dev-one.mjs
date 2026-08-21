// scripts/dev-one.mjs
// 单独启动 projects.json 中某个子项目的开发服务器
// 用法:
//   直接指定: node scripts/dev-one.mjs <项目名>
//   交互选择: node scripts/dev-one.mjs  (方向键选择，回车确认)
// 示例:
//   npm run dev:project -- TelemetryInstruments
//   npm run dev:project

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnOptions, killTree } from "./proc-utils.mjs";
import { ensureProjectsReady } from "./submodule-guard.mjs";
import { filterEnabledProjects } from "./local-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const projectTable = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, "projects.json"), "utf-8"),
);

// ===== 个人本地配置：可选择性禁用部分仓库 =====
// 被禁用的子项目不会出现在选择菜单中；直接指定项目名时给出提示并退出
// （见 scripts/local-config.mjs）。
const enabledProjects = filterEnabledProjects(projectTable);
const disabledProjects = projectTable.filter(
    (p) => !enabledProjects.includes(p),
);
if (disabledProjects.length) {
    console.log(
        `⏭️  以下子项目已在个人配置（.repos.local.json）中禁用: ${disabledProjects
            .map((p) => p.name)
            .join(", ")}`,
    );
}

// ========== 方向键选择菜单 ==========
function arrowSelect(options, displayFn) {
    return new Promise((resolve) => {
        if (options.length === 0) {
            resolve(null);
            return;
        }
        if (options.length === 1) {
            resolve(options[0]);
            return;
        }

        const stdin = process.stdin;
        const stdout = process.stdout;

        // 保存原始状态
        const wasRaw = stdin.isRaw;

        let selectedIndex = 0;
        const totalLines = options.length;

        // 渲染菜单
        function render() {
            // 始终移动光标到菜单顶部
            stdout.write(`\x1b[${totalLines}A`);
            // 逐行重写
            for (let i = 0; i < options.length; i++) {
                const line = displayFn(options[i], i, i === selectedIndex);
                stdout.write("\x1b[2K"); // 清除整行
                stdout.write(line + "\n");
            }
        }

        // 绘制初始菜单
        console.log("📋 请选择要启动的子项目 (↑↓ 移动, 回车 确认, Ctrl+C 取消):\n");
        stdout.write("\n".repeat(options.length)); // 预留空间
        // 光标回退到预留空间顶部
        stdout.write(`\x1b[${options.length}A`);
        render();

        // 进入 raw 模式捕获按键
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");

        function cleanup() {
            stdin.setRawMode(wasRaw);
            stdin.pause();
            stdin.removeListener("data", onData);
            // 光标移到菜单下方
            stdout.write(`\x1b[${options.length - selectedIndex}B`);
            stdout.write("\n");
        }

        function onData(key) {
            // Ctrl+C
            if (key === "\u0003") {
                cleanup();
                console.log("❌ 已取消。");
                process.exit(0);
            }
            // Enter
            else if (key === "\r" || key === "\n") {
                cleanup();
                resolve(options[selectedIndex]);
            }
            // 上箭头
            else if (key === "\x1b[A" || key === "\x1bOA") {
                if (selectedIndex > 0) {
                    selectedIndex--;
                    render();
                }
            }
            // 下箭头
            else if (key === "\x1b[B" || key === "\x1bOB") {
                if (selectedIndex < options.length - 1) {
                    selectedIndex++;
                    render();
                }
            }
        }

        stdin.on("data", onData);
    });
}
// ========== 菜单结束 ==========

// 读取命令行参数（--yes / -y / --no-init 为旗标，其余第一个参数视为项目名）
const argv = process.argv.slice(2);
const autoInit = argv.includes("--yes") || argv.includes("-y");
const skipInit = argv.includes("--no-init");
let targetName = argv.find((a) => !a.startsWith("-"));

// 如果没有提供项目名，交互式选择
if (!targetName) {
    if (enabledProjects.length === 0) {
        console.log("❌ projects.json 中没有可用的子项目（可能全部被个人配置禁用）。");
        process.exit(1);
    }

    if (enabledProjects.length === 1) {
        targetName = enabledProjects[0].name;
        console.log(`📋 只有一个子项目，自动选择: ${targetName}`);
    } else {
        const selected = await arrowSelect(enabledProjects, (p, i, isSelected) => {
            const prefix = isSelected ? "❯" : " ";
            const highlight = isSelected ? "\x1b[36m" : "\x1b[90m";
            const reset = "\x1b[0m";
            return `  ${highlight}${prefix} ${p.name}  (端口: ${p.devPort})${reset}`;
        });
        targetName = selected.name;
    }
}

const project = enabledProjects.find((p) => p.name === targetName);

if (!project) {
    if (projectTable.some((p) => p.name === targetName)) {
        console.log(`⏭️  项目 "${targetName}" 已在个人配置（.repos.local.json）中被禁用。`);
        console.log("   如需启用，从 .repos.local.json 的 disabled 列表中移除对应条目。");
        process.exit(0);
    }
    console.log(`❌ 未找到项目 "${targetName}"。`);
    console.log(`📋 可用项目: ${enabledProjects.map((p) => p.name).join(", ")}`);
    process.exit(1);
}

// ===== 子模块未初始化检测 =====
// 目标子模块未初始化（gitlink 未 checkout）时，询问是否初始化；
// 选择「否」则直接退出，避免在缺失目录上 spawn 报错。
const { ready: readyProjects } = await ensureProjectsReady([project], {
    autoInit,
    skipInit,
});
if (readyProjects.length === 0) {
    console.log(`⏭️  子模块 ${project.dir} 未初始化，已取消启动。`);
    console.log(
        "   需要时执行 git submodule update --init，或使用 pnpm run proj:dev -- <项目名> --yes 自动初始化。",
    );
    process.exit(0);
}

console.log(`🚀 正在启动子项目开发服务器: ${project.name} (端口: ${project.devPort})\n`);

const subServer = spawn("pnpm", ["run", "dev"], {
    ...spawnOptions,
    cwd: path.resolve(ROOT_DIR, project.dir),
});

let isExiting = false;

const killSub = () => {
    if (isExiting) return;
    isExiting = true;
    console.log("\n🛑 正在停止开发服务器...");

    if (subServer.pid) {
        killTree(subServer.pid);
    }

    console.log("✨ 开发服务器已退出。\n");
    process.exit(0);
};

process.stdin.resume();
process.stdin.setEncoding("utf8");

if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
}

process.stdin.on("data", (key) => {
    if (key === "\u0003" || key === "\u0004") {
        killSub();
    }
});

process.on("SIGINT", killSub);
process.on("SIGTERM", killSub);
