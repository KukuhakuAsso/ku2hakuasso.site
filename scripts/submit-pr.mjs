// scripts/submit-pr.mjs
// 提交 PR：为「fork(origin) 领先 upstream」的仓库（主仓库 + 各子模块）创建 GitHub PR。
// 会先 fetch 每个仓库的 origin 与 upstream 并比较分支差异；已有相同 head 的 open PR 时跳过。
// 复用 scripts/sync-fork.mjs 的远程解析与 token 获取逻辑。
// 用法: node scripts/submit-pr.mjs [选项]
//   --yes / -y      --api 模式跳过确认，直接创建所有需要的 PR
//   --main          只处理主仓库，不处理子模块
//   --repo <dir>    只处理指定仓库（主仓库用 "."，子模块用目录名），可多次指定
//   --head <branch> fork 侧分支（默认 main）
//   --base <branch> upstream 侧分支（默认 main）
//   --title <t>     覆盖 PR 标题（默认取领先提交中第一条的标题）
//   --body <b>      覆盖 PR 说明（默认列出全部领先提交）
//   --draft         创建为 draft PR
//   --dry-run       只报告将创建哪些 PR，不调用创建接口
//   --api           使用 GitHub API 自动创建 PR（需要 PAT 或 gh token）
//   --skip-update   跳过执行前的 submodules:update（默认会自动先同步）
//   --help / -h     显示帮助
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import {
    parseRemote,
    parseGitmodules,
    resolveSubRepo,
    makePrompt,
    resolveToken,
    api,
} from './sync-fork.mjs';
import { isDirDisabled } from './local-config.mjs';

const args = process.argv.slice(2);
const HELP = args.includes('--help') || args.includes('-h');
const AUTO = args.includes('--yes') || args.includes('-y');
const MAIN_ONLY = args.includes('--main');
const DRAFT = args.includes('--draft');
const DRY_RUN = args.includes('--dry-run');
const API_MODE = args.includes('--api');
const SKIP_UPDATE = args.includes('--skip-update');

const take = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
};
const HEAD = take('--head') ?? 'main';
const BASE = take('--base') ?? 'main';
const TITLE = take('--title');
const BODY = take('--body');
const REPO_FILTER = [];
for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--repo') REPO_FILTER.push(args[i + 1]);
}

const ROOT = path.resolve(import.meta.dirname, '..');

// ---------- git 工具 ----------
const out = (cwd, gitArgs) => execFileSync('git', ['-C', cwd, ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const gitFetch = (cwd, remote) => execFileSync('git', ['-C', cwd, 'fetch', remote], { stdio: 'ignore' });
const refExists = (cwd, ref) => {
    try { execFileSync('git', ['-C', cwd, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { stdio: 'ignore' }); return true; }
    catch { return false; }
};
const aheadCommits = (cwd, baseRef, headRef) => {
    try {
        const log = execFileSync('git', ['-C', cwd, 'log', '--format=%h %s', `${baseRef}..${headRef}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return log ? log.split(/\r?\n/) : [];
    } catch { return []; }
};

const remoteRepo = (remote) => {
    const url = out('.', ['remote', 'get-url', remote]).replace(/\.git$/, '').replace(/\/$/, '');
    const match = url.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
    if (!match) throw new Error(`无法解析主仓库 ${remote}：${url}`);
    return { owner: match[1], repo: match[2] };
};

const verifyParentOrigin = (repos) => {
    const parentOrigin = remoteRepo('origin');
    const parentUpstream = remoteRepo('upstream');
    if (parentOrigin.owner === parentUpstream.owner && parentOrigin.repo === parentUpstream.repo) {
        throw new Error('主仓库 origin 仍指向 upstream，拒绝提交 PR；请先修正 origin 后执行 pnpm run submodules:update 或 pnpm run fork:sync');
    }
    for (const repo of repos.filter((item) => item.path !== '.')) {
        if (repo.origin.owner !== parentOrigin.owner) {
            throw new Error(`子模块 ${repo.path} 的 origin 与主仓库 origin 不一致，请先执行 pnpm run fork:sync 修正远程地址`);
        }
    }
    let syncedAt = '';
    try { syncedAt = out('.', ['config', '--local', '--get', 'ku2hakuasso.last-submodule-sync']); } catch { /* 尚未同步 */ }
    if (!syncedAt) {
        throw new Error('未找到同步记录；子项目变更后请先执行 pnpm run submodules:update 或 pnpm run fork:sync，再提交 PR');
    }
};

function printHelp() {
    console.log('用法: node scripts/submit-pr.mjs [选项]');
    console.log('  --yes / -y      --api 模式跳过确认，直接创建所有需要的 PR');
    console.log('  --main          只处理主仓库，不处理子模块');
    console.log('  --repo <dir>    只处理指定仓库（主仓库用 "."，子模块用目录名），可多次指定');
    console.log('  --head <branch> fork 侧分支（默认 main）');
    console.log('  --base <branch> upstream 侧分支（默认 main）');
    console.log('  --title <t>     覆盖 PR 标题（默认取领先提交中第一条的标题）');
    console.log('  --body <b>      覆盖 PR 说明（默认列出全部领先提交）');
    console.log('  --draft         创建为 draft PR');
    console.log('  --dry-run       只报告将创建哪些 PR，不调用创建接口');
    console.log('  --api           使用 GitHub API 自动创建 PR（需要 PAT 或 gh token）');
    console.log('  --skip-update   跳过执行前的 submodules:update（默认会自动先同步）');
    console.log('  --help / -h     显示帮助');
}

function openComparePage({ origin: fork, upstream: up }, title) {
    const compare = `https://github.com/${up.owner}/${up.repo}/compare/${encodeURIComponent(BASE)}...${encodeURIComponent(fork.owner)}:${encodeURIComponent(HEAD)}?expand=1&title=${encodeURIComponent(title)}`;
    if (process.platform === 'win32') {
        execFileSync('cmd.exe', ['/d', '/s', '/c', 'start', '""', compare], { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
        execFileSync('open', [compare], { stdio: 'ignore' });
    } else {
        execFileSync('xdg-open', [compare], { stdio: 'ignore' });
    }
    return compare;
}

// ---------- 主流程 ----------
async function main() {
    if (HELP) { printHelp(); return; }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const { input, ask } = makePrompt(rl);
    try {
        await runSubmit({ input, ask });
    } finally {
        rl.close();
    }
}

async function runSubmit({ input, ask }) {
    // 默认先执行 submodules:update，确保子模块与主仓库已同步并推送，fork:pr 差异才完整。
    // --skip-update 可跳过；--dry-run 为只读预览，不自动执行。
    if (!SKIP_UPDATE && !DRY_RUN) {
        console.log('⏳ 先执行 submodules:update 同步子模块与主仓库...');
        execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'update-submodules.mjs')], {
            stdio: 'inherit',
            cwd: ROOT,
        });
    }
    let origin;
    let upstream;
    let upstreamUrl;
    try {
        upstreamUrl = out('.', ['remote', 'get-url', 'upstream']);
        origin = parseRemote(out('.', ['remote', 'get-url', 'origin']));
        upstream = parseRemote(upstreamUrl);
    } catch {
        throw new Error('未找到 origin/upstream 远程，请先 fork 主仓库并配置这两个远程');
    }

    // 仓库清单：主仓库 + 各子模块（个人配置禁用的子模块跳过，见 scripts/local-config.mjs）
    const repos = [{ path: '.', label: '主仓库', origin, upstream }];
    if (!MAIN_ONLY) {
        let subs = [];
        try { subs = parseGitmodules(readFileSync('.gitmodules', 'utf8')); } catch { /* 无 .gitmodules */ }
        for (const s of subs) {
            try {
                if (isDirDisabled(s.path)) {
                    console.log(`⏭️  子模块 ${s.path} 已在个人配置（.repos.local.json）中禁用，跳过`);
                    continue;
                }
                const subUpstream = resolveSubRepo(upstreamUrl, s.url);
                const subOrigin = parseRemote(out(s.path, ['remote', 'get-url', 'origin']));
                repos.push({ path: s.path, label: `子模块 ${s.path}`, origin: subOrigin, upstream: subUpstream });
            } catch (e) {
                console.warn(`⚠ 跳过子模块 ${s.path}：${e.message}`);
            }
        }
    }

    const targets = REPO_FILTER.length
        ? repos.filter((r) => REPO_FILTER.includes(r.path))
        : repos;
    if (targets.length === 0) {
        console.warn(`⚠ 没有匹配 --repo 的仓库（给定：${REPO_FILTER.join('、')}）`);
        return;
    }

    verifyParentOrigin(repos);

    console.log(`submit:pr — 检查 ${targets.length} 个仓库（head=${HEAD} → base=${BASE}）\n`);

    const plan = [];
    for (const repo of targets) {
        const { path: cwd, label, origin: fork, upstream: up } = repo;
        console.log(`▪ ${label}：${fork.owner}/${fork.repo} → ${up.owner}/${up.repo}`);

        if (fork.owner === up.owner && fork.repo === up.repo) {
            console.log('  origin 即 upstream，无需 PR');
            continue;
        }
        try {
            gitFetch(cwd, 'origin');
            gitFetch(cwd, 'upstream');
        } catch (e) {
            console.warn(`  ⚠ fetch 失败：${e.message}，跳过`);
            continue;
        }
        if (cwd === '.') {
            // 提示未推送到 fork 的本地提交（PR 只包含已推到 fork 的提交）
            try {
                const unpushed = aheadCommits('.', `origin/${HEAD}`, 'HEAD');
                if (unpushed.length > 0) {
                    console.warn(`  ⚠ 本地有 ${unpushed.length} 个未推送到 fork 的提交（PR 不会包含它们）：`);
                    for (const c of unpushed) console.warn(`      ${c}`);
                }
            } catch { /* 忽略 */ }
        }

        const headRef = `origin/${HEAD}`;
        const baseRef = `upstream/${BASE}`;
        if (!refExists(cwd, headRef) || !refExists(cwd, baseRef)) {
            console.warn(`  ⚠ 找不到 ${headRef} 或 ${baseRef}，跳过`);
            continue;
        }

        const commits = aheadCommits(cwd, baseRef, headRef);
        if (commits.length === 0) {
            console.log('  ✓ fork 与 upstream 无差异');
            continue;
        }

        // 已存在同 head 的 open PR？（公开仓库无需 token 即可查询；重复检查阶段 token 保持 undefined）
        let existing = [];
        try {
            const res = await api(
                `/repos/${up.owner}/${up.repo}/pulls?state=open&head=${encodeURIComponent(`${fork.owner}:${HEAD}`)}&base=${BASE}`,
                {},
            );
            if (res.ok) existing = await res.json();
        } catch (e) {
            console.warn(`  ⚠ 检查已有 PR 失败（${e.message}），继续`);
        }
        if (existing.length > 0) {
            console.log(`  ✓ 已存在 PR #${existing[0].number}：${existing[0].html_url}`);
            continue;
        }

        const title = TITLE ?? commits[0].replace(/^\S+\s+/, '');
        const body = BODY ?? commits.map((c) => `- ${c}`).join('\n');
        plan.push({ repo, title, body, commits });
        console.log(`  ➜ 待创建 PR（${commits.length} 个提交）：${title}`);
    }

    console.log('');
    if (plan.length === 0) {
        console.log('✔ 没有需要创建的 PR');
        return;
    }
    if (DRY_RUN) {
        console.log('--dry-run：以下 PR 将被创建（未实际调用接口）');
        for (const p of plan) {
            console.log(`  PR: ${p.repo.upstream.owner}/${p.repo.upstream.repo} ← ${p.repo.origin.owner}:${HEAD} → ${p.repo.upstream.owner}:${BASE}`);
        }
        return;
    }

    if (!API_MODE) {
        console.log('默认使用无 PAT 模式：打开 GitHub compare 页面，请在浏览器或 VS Code GitHub 插件中确认并创建 PR。');
        for (const p of plan) {
            try {
                const url = openComparePage(p.repo, p.title);
                console.log(`✔ 已打开 ${p.repo.upstream.owner}/${p.repo.upstream.repo} 的 PR 页面：${url}`);
            } catch (e) {
                console.warn(`⚠ 无法自动打开 ${p.repo.upstream.owner}/${p.repo.upstream.repo} 的页面：${e.message}`);
                console.log(`  请手动打开：https://github.com/${p.repo.upstream.owner}/${p.repo.upstream.repo}/compare/${BASE}...${p.repo.origin.owner}:${HEAD}?expand=1`);
            }
        }
        return;
    }

    const confirm = AUTO || await ask(`将为 ${plan.length} 个仓库创建 PR，继续？`, false);
    if (!confirm) { console.log('已取消'); return; }

    // 仅在真正创建前解析 token（--yes 时也应先确认 token 可用）
    let token;
    try { token = await resolveToken(input, ask); }
    catch (e) { throw new Error(`需要 GitHub Token 才能创建 PR（${e.message}）`, { cause: e }); }

    for (const p of plan) {
        const { origin: fork, upstream: up } = p.repo;
        try {
            const res = await api(`/repos/${up.owner}/${up.repo}/pulls`, {
                method: 'POST',
                token,
                body: {
                    title: p.title,
                    body: p.body,
                    head: `${fork.owner}:${HEAD}`,
                    base: BASE,
                    ...(DRAFT ? { draft: true } : {}),
                },
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                console.log(`✔ 已创建 PR #${data.number}：${data.html_url}`);
            } else {
                const hint = res.status === 403
                    ? '（常见原因：fine-grained PAT 缺少对目标仓库的 Pull requests 写权限，或经典 PAT 未授权该组织，请检查 token 权限后重试）'
                    : '';
                console.warn(`✖ 创建 ${up.owner}/${up.repo} 的 PR 失败（HTTP ${res.status}${data.message ? `：${data.message}` : ''}）${hint}`);
            }
        } catch (e) {
            console.warn(`✖ 创建 ${up.owner}/${up.repo} 的 PR 失败：${e.message}`);
        }
    }
}

main().catch((e) => {
    console.error(`✖ ${e.message}`);
    process.exitCode = 1;
});
