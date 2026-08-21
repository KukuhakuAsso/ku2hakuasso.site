// scripts/dev-all.mjs
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnOptions, killTree } from "./proc-utils.mjs";
import { ensureProjectsReady } from "./submodule-guard.mjs";
import {
    filterEnabledProjects,
    isMainDisabled,
    printDisabledNotice,
} from "./local-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const projectTable = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, "projects.json"), "utf-8"),
);

// ===== 个人本地配置：可选择性禁用部分仓库 =====
// .repos.local.json 中可禁用主站（"main"）或任意子项目（按 name / dir 匹配），
// 被禁用的仓库不拉起开发服务器（见 scripts/local-config.mjs）。
const mainDisabled = isMainDisabled();
const enabledProjects = filterEnabledProjects(projectTable);
printDisabledNotice({ projects: projectTable, mainDisabled });

// ===== 子模块未初始化检测 =====
// 未初始化（gitlink 未 checkout）的子模块目录不存在，直接 spawn 会因
// 找不到工作目录而报错；这里先检测并询问是否初始化，选择「否」的子项目不拉起。
// 旗标：--yes / -y 直接初始化；--no-init 直接跳过。
const argv = process.argv.slice(2);
const autoInit = argv.includes("--yes") || argv.includes("-y");
const skipInit = argv.includes("--no-init");

const { ready, skipped } = await ensureProjectsReady(enabledProjects, {
    autoInit,
    skipInit,
});

console.log("🚀 正在并发启动所有项目的开发服务器...\n");

const runningProcesses = [];

// 1. 启动 VitePress 博客（除非被个人配置禁用）
if (mainDisabled) {
    console.log(
        `⏭️  主站已被个人配置（.repos.local.json）禁用，跳过 VitePress 开发服务器。`,
    );
} else {
    const docsServer = spawn("pnpm", ["vitepress", "dev", "docs"], {
        ...spawnOptions,
        cwd: ROOT_DIR,
    });
    runningProcesses.push(docsServer);
}

// 2. 自动遍历 JSON 表，启动所有已就绪的子项目
for (const project of ready) {
    console.log(
        `🔗 正在拉起子项目开发服务器: ${project.name} (端口预测: ${project.devPort})`,
    );
    const subServer = spawn("pnpm", ["run", "dev"], {
        ...spawnOptions,
        cwd: path.resolve(ROOT_DIR, project.dir),
    });
    runningProcesses.push(subServer);
}

// 提示被跳过的未初始化子模块
if (skipped.length) {
    console.log(
        `\nℹ️  已跳过 ${skipped.length} 个未初始化子项目（${skipped
            .map((p) => p.name)
            .join(", ")}），其开发服务器未启动。`,
    );
    console.log(
        "   需要时执行 git submodule update --init，或使用 pnpm run dev -- --yes 自动初始化。",
    );
}

// 防抖标志，防止疯狂按 Ctrl+C 导致重复执行
let isExiting = false;

// 统一关闭管理
const killAll = () => {
    if (isExiting) return;
    isExiting = true;
    console.log("\n🛑 接收到退出信号，正在强制清场...");

    runningProcesses.forEach((proc) => killTree(proc.pid));

    console.log("✨ 所有后台进程已干净退出。\n");
    process.exit(0);
};

process.stdin.resume(); // 唤醒标准输入流
process.stdin.setEncoding("utf8");

// 如果支持 raw 模式，开启它（能更敏锐地捕获单次按键）
if (process.stdin.setRawMode) {
    process.stdin.setRawMode(true);
}

// 暴力监听数据流
process.stdin.on("data", (key) => {
    // \u0003 是 Ctrl+C 的十六进制 ASCII 码
    // \u0004 是 Ctrl+D 的十六进制 ASCII 码
    if (key === "\u0003" || key === "\u0004") {
        killAll();
    }
});

process.on("SIGINT", killAll);
process.on("SIGTERM", killAll);
