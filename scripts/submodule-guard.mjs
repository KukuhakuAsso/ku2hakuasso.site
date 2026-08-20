// scripts/submodule-guard.mjs
// 子模块初始化检测公共工具：供 dev / build / dev-one 等编排脚本调用，
// 避免子模块未初始化（gitlink 未 checkout）时启动或构建报错（如 ENOENT）。
// 检测到未初始化的子模块时，默认逐项询问是否执行 git submodule update --init；
// 选择「否」或初始化失败的项目会被跳过，不再拉起。
//
// 使用方式：
//   import { ensureProjectsReady } from "./submodule-guard.mjs";
//   const { ready, skipped } = await ensureProjectsReady(projects, { autoInit, skipInit });
//
// 命令行旗标（由各脚本自行解析后透传）：
//   --yes / -y   检测到未初始化子模块时直接初始化，不再询问
//   --no-init    检测到未初始化子模块时直接跳过，不再询问
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

/** 判断 projects.json 中的一个子项目是否未初始化 */
export function isSubmoduleUninitialized(project) {
    const dir = project?.dir;
    if (!dir) return false;

    // 优先用 git 判断：`git submodule status` 中 '-' 前缀表示未初始化
    try {
        const out = execFileSync(
            "git",
            ["-C", ROOT_DIR, "submodule", "status", "--", dir],
            { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
        ).trim();
        if (out) {
            // 输出形如：-<sha> <dir>（未初始化） /  <sha> <dir>（已初始化）
            return out.split(/\r?\n/).some((line) => /^-/.test(line.trim()));
        }
        // 无输出：该目录不是已注册的子模块，退回目录检查
    } catch {
        // 非 git 仓库或 git 不可用，退回目录检查
    }

    // 目录级检查：目录不存在或缺少 package.json 视为未初始化
    const dirPath = path.resolve(ROOT_DIR, dir);
    if (!fs.existsSync(dirPath)) return true;
    return !fs.existsSync(path.join(dirPath, "package.json"));
}

/** 初始化单个子模块（等价于 git submodule update --init --recursive -- <dir>） */
export function initSubmodule(project) {
    const dir = project.dir;
    console.log(`⏳ 正在初始化子模块 ${dir}（git submodule update --init）...`);
    execFileSync(
        "git",
        [
            "-C",
            ROOT_DIR,
            "submodule",
            "update",
            "--init",
            "--recursive",
            "--",
            dir,
        ],
        { stdio: "inherit" },
    );
    console.log(`✔ 子模块 ${dir} 初始化完成`);
}

/** 交互式 y/N 询问；非 TTY 环境（如 CI）直接返回默认值 */
export function askYesNo(question, def = false) {
    return new Promise((resolve) => {
        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            console.log(`ℹ️  非交互环境，默认${def ? "初始化" : "跳过"}。`);
            resolve(def);
            return;
        }
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const hint = def ? "[Y/n]" : "[y/N]";
        rl.question(`${question} ${hint} `, (answer) => {
            rl.close();
            const text = answer.trim().toLowerCase();
            if (text === "") {
                resolve(def);
                return;
            }
            resolve(text === "y" || text === "yes");
        });
    });
}

/**
 * 检测所有子项目，对未初始化的子模块询问是否初始化。
 * @param {Array} projects projects.json 中的子项目列表
 * @param {{ autoInit?: boolean, skipInit?: boolean }} options
 *   autoInit：直接初始化，不询问（--yes）
 *   skipInit：直接跳过，不询问（--no-init）
 * @returns {Promise<{ ready: Array, skipped: Array }>}
 *   ready   可正常启动/构建的子项目
 *   skipped 未初始化且被跳过的子项目
 */
export async function ensureProjectsReady(projects, options = {}) {
    const { autoInit = false, skipInit = false } = options;

    // 预先检测一次，避免循环内重复执行 git
    const uninitializedMap = new Map(
        projects.map((p) => [p, isSubmoduleUninitialized(p)]),
    );

    const pending = projects.filter((p) => uninitializedMap.get(p));
    if (pending.length) {
        console.log(`\n⚠️  检测到 ${pending.length} 个子模块未初始化:`);
        for (const p of pending) {
            console.log(`  - ${p.name}（${p.dir}）`);
        }
        console.log("");
    }

    const ready = [];
    const skipped = [];
    for (const project of projects) {
        if (!uninitializedMap.get(project)) {
            ready.push(project);
            continue;
        }

        let shouldInit = autoInit;
        if (!shouldInit && !skipInit) {
            shouldInit = await askYesNo(
                `❓ 是否初始化子模块 ${project.dir}？`,
            );
        }

        if (shouldInit) {
            try {
                initSubmodule(project);
                ready.push(project);
            } catch (err) {
                console.error(
                    `❌ 子模块 ${project.dir} 初始化失败：${err.message}`,
                );
                console.error(
                    "   请先检查网络与远程仓库配置，再执行 git submodule update --init 重试。",
                );
                skipped.push(project);
            }
        } else {
            console.log(
                `⏭️  跳过未初始化的子项目 ${project.name}（${project.dir}）`,
            );
            skipped.push(project);
        }
    }

    return { ready, skipped };
}
