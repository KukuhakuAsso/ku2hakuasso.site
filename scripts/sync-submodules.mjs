// scripts/sync-submodules.mjs
// 自动同步子模块到最新 main/master 分支（供 .github/workflows/sync-submodules.yml 调用）。
//
// 设计要点（对应 CI 代码审查反馈）：
//   1. 显式 refspec 拉取远端分支（+refs/heads/<b>:refs/remotes/origin/<b>），并用 FETCH_HEAD
//      检出，不依赖浅克隆/自定义 refspec 下可能缺失或陈旧的 origin/<branch> 跟踪分支。
//   2. 子模块未初始化（目录不是有效 git 仓库）时自动 `git submodule update --init`，失败给出明确报错。
//   3. 按 .gitmodules 的「节名」遍历（name != path 也正确），不假设 name == path。
//   4. 每个子模块的每一步都 try/catch，输出 ::error:: 定位到「子模块 + 具体步骤」。
//   5. 仅自动更新 branch=main|master 的子模块；未配置 branch 或指向其他分支的视为固定 gitlink
//      （pinned），跳过、不报错。
//   6. 递归处理嵌套子模块：进入含 .gitmodules 的子模块继续同步；嵌套有实际变更时在嵌套仓库内
//      提交，父仓库才能记录到新的 gitlink。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");
const ALLOWED_BRANCHES = ["main", "master"];
const MAX_DEPTH = 8;
const BOT_NAME = "github-actions[bot]";
const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

const git = (cwd, args, opts = {}) =>
    execFileSync("git", args, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd,
        ...opts,
    });

/** 读取某仓库目录下 .gitmodules 中的子模块定义（按节名，name != path 也正确） */
function readSubmodules(repoDir) {
    const gitmodulesPath = path.join(repoDir, ".gitmodules");
    if (!fs.existsSync(gitmodulesPath)) return [];
    const out = git(repoDir, [
        "config",
        "-f",
        gitmodulesPath,
        "--get-regexp",
        "^submodule\\..*\\.(path|url|branch)$",
    ]).trim();
    const map = new Map();
    for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^submodule\.(.+?)\.(path|url|branch)\s+(.+)$/);
        if (!m) continue;
        const [, name, key, value] = m;
        if (!map.has(name)) map.set(name, { name });
        map.get(name)[key] = value;
    }
    return [...map.values()];
}

/** 读取仓库 index 中某子模块的 gitlink（已暂存/未提交也正确） */
function readIndexGitlink(repoDir, subPath) {
    try {
        const parts = git(repoDir, ["ls-files", "-s", "--", subPath])
            .trim()
            .split(/\s+/);
        return parts.length >= 2 ? parts[1] : "";
    } catch {
        return "";
    }
}

/** 确保子模块已初始化；未初始化则自动补齐，返回是否可用 */
function ensureInitialized(repoDir, sub, errors) {
    const subDir = path.join(repoDir, sub.path);
    try {
        git(subDir, ["rev-parse", "--git-dir"], { stdio: ["ignore", "ignore", "ignore"] });
        return true;
    } catch {
        if (!sub.url) {
            errors.push(
                `[${sub.name}] 子模块未初始化且 .gitmodules 缺少 url，无法自动补齐（${sub.path}）`,
            );
            return false;
        }
        try {
            console.log(`   ⏳ 初始化 ${sub.path}（git submodule update --init）...`);
            git(repoDir, ["submodule", "update", "--init", "--", sub.path], {
                stdio: ["ignore", "inherit", "inherit"],
            });
            return true;
        } catch (e) {
            errors.push(
                `[${sub.name}] 子模块未初始化且 git submodule update --init 失败（${sub.path}）: ${
                    (e.stderr || e.message).trim()
                }`,
            );
            return false;
        }
    }
}

/** 更新单个子模块到其 branch（已校验 main|master）的最新提交；失败返回 null */
function updateOne(repoDir, sub, errors) {
    const subDir = path.join(repoDir, sub.path);
    const branch = sub.branch;
    const before = readIndexGitlink(repoDir, sub.path);

    if (!ensureInitialized(repoDir, sub, errors)) return null;

    // 1) 显式 refspec 拉取，确保远程跟踪分支一定更新到最新
    try {
        git(
            subDir,
            ["fetch", "--quiet", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
            { stdio: ["ignore", "inherit", "inherit"] },
        );
    } catch (e) {
        errors.push(
            `[${sub.name}] git fetch origin ${branch} 失败: ${(e.stderr || e.message).trim()}`,
        );
        return null;
    }

    // 2) 解析最新提交：优先远程跟踪分支，回退 FETCH_HEAD
    let tip;
    try {
        tip = git(subDir, ["rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]).trim();
    } catch {
        try {
            tip = git(subDir, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]).trim();
        } catch {
            errors.push(`[${sub.name}] 无法解析 ${branch} 分支的最新提交`);
            return null;
        }
    }

    // 3) 检出最新提交（detached HEAD，CI 自动流程可接受）
    try {
        git(subDir, ["checkout", "--quiet", "FETCH_HEAD"], { stdio: ["ignore", "inherit", "inherit"] });
    } catch (e) {
        errors.push(
            `[${sub.name}] checkout ${branch} 最新提交失败: ${(e.stderr || e.message).trim()}`,
        );
        return null;
    }

    // 4) 记录 gitlink（git add -- 防止路径以 - 开头被当作选项）
    try {
        git(repoDir, ["add", "--", sub.path], { stdio: ["ignore", "ignore", "ignore"] });
    } catch (e) {
        errors.push(`[${sub.name}] git add ${sub.path} 失败: ${(e.stderr || e.message).trim()}`);
        return null;
    }

    const moved = before && before !== tip;
    console.log(
        `✅ [${sub.name}] ${sub.path} → ${branch} 最新 ${tip.slice(0, 7)}${
            moved ? `（${before.slice(0, 7)} → ${tip.slice(0, 7)}）` : "（无变化）"
        }`,
    );
    return tip;
}

/** 递归同步一个仓库目录内的子模块；返回是否发生了实际 gitlink 变更 */
function syncRepo(repoDir, errors, depth = 0) {
    const subs = readSubmodules(repoDir);
    if (subs.length === 0) return false;
    const rel = path.relative(ROOT_DIR, repoDir) || ".";
    console.log(`\n${"  ".repeat(depth)}🔍 ${rel}：${subs.length} 个子模块`);

    let changed = false;
    for (const sub of subs) {
        const branch = sub.branch || "";
        if (!ALLOWED_BRANCHES.includes(branch)) {
            console.log(
                `${"  ".repeat(depth + 1)}⏭️  [${sub.name}] 未配置 branch 或非 main/master（${branch || "无"}），视为固定 gitlink，跳过`,
            );
            continue;
        }
        if (!sub.path) {
            errors.push(`[${sub.name}] 缺少 path`);
            continue;
        }
        const subDir = path.join(repoDir, sub.path);
        const before = readIndexGitlink(repoDir, sub.path);
        const after = updateOne(repoDir, sub, errors);
        if (after === null) continue; // 已记录 error
        if (before !== after) changed = true;

        // 6) 递归嵌套子模块：嵌套有实际变更时在嵌套仓库内提交，父仓库才能记录到新 gitlink
        if (depth < MAX_DEPTH && fs.existsSync(path.join(subDir, ".gitmodules"))) {
            const nestedChanged = syncRepo(subDir, errors, depth + 1);
            if (nestedChanged) {
                console.log(`${"  ".repeat(depth + 1)}📦 提交 ${sub.path} 内的嵌套子模块变更...`);
                try {
                    git(subDir, ["add", "-A"], { stdio: ["ignore", "ignore", "ignore"] });
                    git(
                        subDir,
                        [
                            "-c",
                            `user.name=${BOT_NAME}`,
                            "-c",
                            `user.email=${BOT_EMAIL}`,
                            "commit",
                            "-m",
                            "chore: sync nested submodules",
                        ],
                        { stdio: ["ignore", "inherit", "inherit"] },
                    );
                    git(repoDir, ["add", "--", sub.path], { stdio: ["ignore", "ignore", "ignore"] });
                    changed = true;
                } catch (e) {
                    errors.push(
                        `[${sub.name}] 嵌套子模块变更后提交失败: ${(e.stderr || e.message).trim()}`,
                    );
                }
            }
        }
    }
    return changed;
}

function main() {
    let subs;
    try {
        subs = readSubmodules(ROOT_DIR);
    } catch (e) {
        console.error(`::error::解析 .gitmodules 失败: ${(e.stderr || e.message).trim()}`);
        process.exit(1);
    }
    if (subs.length === 0) {
        console.error("::error::根目录 .gitmodules 缺失或未配置任何子模块，无法执行自动同步");
        process.exit(1);
    }

    const errors = [];
    try {
        syncRepo(ROOT_DIR, errors, 0);
    } catch (e) {
        console.error(`::error::同步过程中发生未预期错误: ${(e.stderr || e.message).trim()}`);
        process.exit(1);
    }

    if (errors.length) {
        console.error("\n❌ 子模块同步失败:");
        for (const e of errors) console.error("  " + e);
        process.exit(1);
    }
    console.log("\n✅ 子模块同步完成");
}

main();
