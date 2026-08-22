// scripts/check-submodules.mjs
// 校验主仓库记录的子模块 gitlink 是否指向其 main/master 分支上的提交。
// 供 CI 使用（.github/workflows/ci.yml 的 submodule-branch job）。
//
// 背景：主仓库通过 gitlink 锁定子模块提交；若该提交不在子项目 main/master
// 分支上（例如误提交测试分支、或指向被 force push 移除的孤儿提交），
// 构建/部署会拉取到非预期版本。本脚本在提交/PR 时拦截此类情况。
//
// 判定（对 .gitmodules 中每个子模块）：
//   1. git ls-tree HEAD <path> 取 gitlink 提交
//   2. 读取 submodule.<path>.branch：已配置则必须是 main 或 master；
//      未配置则以 main、master 依次作为候选分支
//   3. 在临时目录里 git init + 解析相对 URL + git fetch origin <候选分支>
//   4. git merge-base --is-ancestor <gitlink> FETCH_HEAD
//      —— gitlink 是分支祖先（含相等）即视为「位于该分支上」
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const ALLOWED_BRANCHES = ["main", "master"];

const git = (args, opts = {}) =>
    execFileSync("git", args, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        cwd: ROOT_DIR,
        ...opts,
    });

/** 读取 .gitmodules 中的子模块列表：{ name, path, url, branch? } */
function readSubmodules() {
    const gitmodulesPath = path.join(ROOT_DIR, ".gitmodules");
    if (!fs.existsSync(gitmodulesPath)) return [];
    const out = git([
        "config",
        "-f",
        ".gitmodules",
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

/** 把相对 URL（../xxx.git）按 git 语义相对主仓库 origin 解析 */
function resolveSubmoduleUrl(smUrl, mainUrl) {
    if (!smUrl.startsWith("../") && !smUrl.startsWith("./")) return smUrl;
    if (!mainUrl) return smUrl;
    if (mainUrl.includes("://")) {
        // https:// / ssh:// 等：补 "/" 让末尾仓库名被当作文件，../ 才能正确上跳一级
        // （与 git 解析相对子模块 URL 的行为一致）
        return new URL(smUrl, mainUrl.endsWith("/") ? mainUrl : `${mainUrl}/`).href;
    }
    // scp-like 形式：git@github.com:owner/repo.git
    const m = mainUrl.match(/^([^@]+@[^:]+):(.+)$/);
    if (!m) return smUrl;
    const [, host, repoPath] = m;
    const dir = repoPath.replace(/\/[^/]*$/, ""); // 去掉末尾仓库名
    return `${host}:${path.posix.normalize(path.posix.join(dir, smUrl))}`;
}

function main() {
    const errors = [];
    const submodules = readSubmodules();
    if (submodules.length === 0) {
        console.log("ℹ️  .gitmodules 中无子模块，跳过检查");
        return;
    }

    // 主仓库 origin 用于解析相对子模块 URL（CI 中为 HTTPS，本地可能是 SSH）
    let mainOrigin = "";
    try {
        mainOrigin = git(["config", "--get", "remote.origin.url"]).trim();
    } catch {
        // 无 origin（本地独立仓库）时相对 URL 保持原样，交由 git 自行处理
    }

    for (const sub of submodules) {
        if (!sub.path || !sub.url) {
            errors.push(`[${sub.name}] .gitmodules 缺少 path 或 url`);
            continue;
        }

        // 1. 读取 gitlink
        let gitlink = "";
        try {
            gitlink = git(["ls-tree", "HEAD", sub.path]).trim().split(/\s+/)[2] || "";
        } catch {
            // HEAD 中无该路径
        }
        if (!gitlink) {
            errors.push(`[${sub.path}] 无法从 HEAD 读取 gitlink（子模块未记录？）`);
            continue;
        }

        // 2. 分支候选：配置了 branch 则必须为 main/master；否则 main/master 依次尝试
        let candidates;
        if (sub.branch) {
            if (!ALLOWED_BRANCHES.includes(sub.branch)) {
                errors.push(
                    `[${sub.path}] .gitmodules 配置的 branch="${sub.branch}"，仅允许 ${ALLOWED_BRANCHES.join("/")}`,
                );
                continue;
            }
            candidates = [sub.branch];
        } else {
            candidates = [...ALLOWED_BRANCHES];
        }

        // 3/4. 临时仓库拉取候选分支，校验 gitlink 是否为分支祖先
        const url = resolveSubmoduleUrl(sub.url, mainOrigin);
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "submod-check-"));
        let ok = false;
        try {
            git(["init", "--quiet", tmp], { stdio: ["ignore", "ignore", "ignore"] });
            git(["-C", tmp, "remote", "add", "origin", url], {
                stdio: ["ignore", "ignore", "ignore"],
            });
            for (const branch of candidates) {
                try {
                    git(["-C", tmp, "fetch", "--quiet", "origin", branch], {
                        stdio: ["ignore", "ignore", "ignore"],
                    });
                } catch {
                    continue; // 该候选分支在远端不存在，尝试下一个
                }
                try {
                    git(
                        [
                            "-C",
                            tmp,
                            "merge-base",
                            "--is-ancestor",
                            gitlink,
                            "FETCH_HEAD",
                        ],
                        { stdio: ["ignore", "ignore", "ignore"] },
                    );
                    console.log(
                        `✅ [${sub.path}] gitlink ${gitlink.slice(0, 7)} 位于 ${branch} 分支`,
                    );
                    ok = true;
                    break;
                } catch {
                    // gitlink 不在该分支上，尝试下一个候选
                }
            }
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }

        if (!ok) {
            errors.push(
                `[${sub.path}] gitlink ${gitlink} 不在 ${candidates.join(" / ")} 分支上（指向了非 main/master 的提交）`,
            );
        }
    }

    if (errors.length) {
        console.error("\n❌ 子模块分支校验失败:");
        for (const e of errors) console.error("  " + e);
        process.exit(1);
    }
    console.log("\n✅ 所有子模块均指向 main/master 分支");
}

main();
