// scripts/sync-fork.mjs
// 同步 fork：从 upstream 拉取主仓库并更新子模块，并保证本地 upstream 远程地址正确。
// 执行时若 GitHub 上不存在对应仓库（主 fork 或子模块 fork），会询问是否创建：
//   --yes             跳过询问，直接创建所有缺失的 fork 仓库
//   --no-submodules   不检查/不创建子模块 fork
//   --no-sync         只处理仓库创建，不执行 pull / submodule update
//   --no-create       不创建任何 fork，可在无 PAT 时运行同步部分
//   --store-token     将创建仓库用的专用 PAT 存入 Windows 凭据管理器后退出
// 创建仓库使用最小权限 PAT（repo 权限即可，建议设置到期时间），存放在 Windows 凭据管理器中
// 静默读取；不使用 VS Code 登录会话、不打印凭据。也兼容 GITHUB_TOKEN / GH_TOKEN 环境变量、
// git config github.token 与已登录的 gh CLI。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
const AUTO = args.includes('--yes') || args.includes('-y');
const NO_SUBS = args.includes('--no-submodules');
const NO_SYNC = args.includes('--no-sync');
const NO_CREATE = args.includes('--no-create');
const STORE_TOKEN = args.includes('--store-token');

if (args.includes('--help') || args.includes('-h')) {
    console.log('用法: node scripts/sync-fork.mjs [选项]');
    console.log('  --yes             跳过询问，直接创建所有缺失的 fork 仓库');
    console.log('  --no-submodules   不检查/不创建子模块 fork');
    console.log('  --no-sync         只处理仓库创建，不执行 pull / submodule update');
    console.log('  --no-create       不创建任何 fork，可在无 PAT 时运行同步部分');
    console.log('  --store-token     将创建仓库用的专用 PAT 存入 Windows 凭据管理器后退出');
    process.exit(0);
}

const run = (command, commandArgs) => execFileSync(command, commandArgs, { stdio: 'inherit' });
const out = (command, commandArgs) => execFileSync(command, commandArgs, { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- 交互 ----------
/** 基于 readline 构建询问工具；仅在真正需要交互时创建（避免 import 时占用 stdin） */
export function makePrompt(rl) {
    let closed = false;
    rl.on('close', () => { closed = true; });
    const input = (question) => new Promise((resolve) => {
        if (closed || !process.stdin.isTTY) { resolve(''); return; }
        rl.question(`${question} `, (answer) => resolve(answer.trim()));
    });
    const ask = async (question, def = false) => {
        const answer = await input(`${question}${def ? ' [Y/n]' : ' [y/N]'}`);
        return answer ? ['y', 'yes', '是'].includes(answer.toLowerCase()) : def;
    };
    return { input, ask };
}

// ---------- GitHub ----------
/** 解析 GitHub 远程地址为 { owner, repo } */
export function parseRemote(url) {
    const clean = url.replace(/\.git$/, '').replace(/\/+$/, '');
    const https = clean.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/);
    if (https) return { owner: https[1], repo: https[2] };
    const ssh = clean.match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+)$/);
    if (ssh) return { owner: ssh[1], repo: ssh[2] };
    throw new Error(`无法解析 GitHub 远程地址：${url}`);
}

/** 通过 git ls-remote 判断仓库是否存在（公开仓库无需 Token） */
function gitRemoteExists(owner, repo) {
    try {
        execFileSync('git', ['ls-remote', `https://github.com/${owner}/${repo}.git`], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

export async function api(apiPath, { method = 'GET', token, body } = {}) {
    return fetch(`https://api.github.com${apiPath}`, {
        method,
        headers: {
            'User-Agent': 'ku2hakuasso-sync-fork',
            Accept: 'application/vnd.github+json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

/** 轮询等待 fork 创建完成，返回 { owner, repo } */
async function waitForRepo(fullName, token) {
    for (let i = 0; i < 30; i += 1) {
        await sleep(2000);
        const res = await api(`/repos/${fullName}`, { token });
        if (res.status === 200) {
            const data = await res.json();
            return { owner: data.owner.login, repo: data.name };
        }
    }
    throw new Error(`fork ${fullName} 创建后 60 秒内未就绪，请到 GitHub 上确认`);
}

/** 创建 fork：优先创建在指定组织下，403/422（无权限等）时回退到当前账号 */
async function createFork(upOwner, upRepo, org, token) {
    const attempts = [
        { organization: org, default_branch_only: true },
        { default_branch_only: true },
    ];
    let lastStatus = 0;
    for (const body of attempts) {
        const res = await api(`/repos/${upOwner}/${upRepo}/forks`, { method: 'POST', token, body });
        lastStatus = res.status;
        if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (!data.full_name) throw new Error('fork 接口返回异常，请检查 Token 权限');
            return waitForRepo(data.full_name, token);
        }
        if (body.organization && (res.status === 403 || res.status === 422)) continue; // 回退到个人账号
        const err = await res.json().catch(() => ({}));
        throw new Error(`创建 fork 失败（HTTP ${res.status}${err.message ? `：${err.message}` : ''}）`);
    }
    throw new Error(`创建 fork 失败（HTTP ${lastStatus}）`);
}

// ---------- 凭据（Windows 凭据管理器） ----------
/** 专用 PAT 在 Git Credential Manager 中的主机别名（与 github.com 隔离，避免误用登录会话） */
const CRED_HOST = 'k2h-fork';

/** 从 Windows 凭据管理器静默读取专用 PAT（未存储返回 null，绝不弹窗、不打印） */
function credentialFromManager() {
    const env = { ...process.env, GCM_INTERACTIVE: 'never' };
    // 屏蔽 askpass 环境变量，避免未命中时回退到交互式询问
    delete env.GIT_ASKPASS;
    delete env.SSH_ASKPASS;
    delete env.VSCODE_GIT_ASKPASS_NODE;
    delete env.VSCODE_GIT_ASKPASS_MAIN;
    try {
        const raw = execFileSync('git', ['-c', 'credential.interactive=false', 'credential', 'fill'], {
            input: `protocol=https\nhost=${CRED_HOST}\n\n`,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            env,
            timeout: 15000,
        });
        const line = raw.split(/\r?\n/).find((l) => l.startsWith('password='));
        return line?.slice('password='.length) || null;
    } catch {
        return null;
    }
}

/** 将专用 PAT 存入 Windows 凭据管理器 */
function storeCredential(token) {
    execFileSync('git', ['credential-manager', 'store'], {
        input: `protocol=https\nhost=${CRED_HOST}\nusername=pat\npassword=${token}\n\n`,
        stdio: ['pipe', 'ignore', 'ignore'],
    });
}

export async function resolveToken(input, ask) {
    const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (fromEnv) return fromEnv;
    try {
        const fromConfig = out('git', ['config', '--get', 'github.token']);
        if (fromConfig) return fromConfig;
    } catch { /* 未配置，忽略 */ }
    try {
        const fromGh = out('gh', ['auth', 'token']);
        if (fromGh) return fromGh;
    } catch { /* 未安装 gh，忽略 */ }
    const stored = credentialFromManager();
    if (stored) return stored;
    if (!process.stdin.isTTY) {
        throw new Error('未找到可用的 GitHub Token：请先运行 pnpm run fork:token 将专用 PAT 存入 Windows 凭据管理器，或设置 GITHUB_TOKEN 环境变量');
    }
    const save = await ask('未找到已存储的专用 token。是否输入 PAT 并存入 Windows 凭据管理器？', true);
    const token = await input(save
        ? '请粘贴 Personal Access Token（需要 repo 权限，将存入 Windows 凭据管理器）：'
        : '请粘贴 Personal Access Token（仅本次内存使用，不落盘）：');
    if (!token) throw new Error('未提供 GitHub Token，取消创建');
    if (save) {
        try {
            storeCredential(token);
            console.log(`✔ 已存入 Windows 凭据管理器（host=${CRED_HOST}）`);
        } catch (e) {
            console.warn(`⚠ 存入凭据管理器失败：${e.message}，本次仅内存使用`);
        }
    }
    return token;
}

/** 确保仓库的 upstream 远程地址正确（不存在则添加，不同则更新） */
function ensureUpstream(cwd, { owner, repo }) {
    const url = `https://github.com/${owner}/${repo}.git`;
    let current = '';
    try {
        current = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'upstream'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { /* 未配置 upstream */ }
    if (!current) {
        run('git', ['-C', cwd, 'remote', 'add', 'upstream', url]);
        console.log(`✔ 已添加 upstream：${url}（${cwd === '.' ? '主仓库' : cwd}）`);
    } else if (current !== url) {
        run('git', ['-C', cwd, 'remote', 'set-url', 'upstream', url]);
        console.log(`✔ 已更新 upstream：${current} → ${url}（${cwd === '.' ? '主仓库' : cwd}）`);
    }
}

// ---------- 子模块 ----------
/** 解析 .gitmodules，返回 [{ name, path, url }] */
export function parseGitmodules(content) {
    const subs = [];
    let current = null;
    for (const line of content.split(/\r?\n/)) {
        const section = line.match(/^\[submodule\s+"([^"]+)"\]/);
        if (section) { current = { name: section[1], path: '', url: '' }; subs.push(current); continue; }
        const kv = line.match(/^\s*(path|url)\s*=\s*(\S+)\s*$/);
        if (current && kv) current[kv[1]] = kv[2];
    }
    return subs.filter((s) => s.path && s.url);
}

/** 将 .gitmodules 中的 url（支持相对地址 ../xxx.git）解析为上游仓库 { owner, repo } */
export function resolveSubRepo(upstreamUrl, subUrl) {
    if (/^(https?:|git@|ssh:)/.test(subUrl)) return parseRemote(subUrl);
    // 相对地址：把上游仓库 URL 当作目录解析（与 git 的行为一致）
    const base = upstreamUrl.endsWith('/') ? upstreamUrl : `${upstreamUrl}/`;
    return parseRemote(new URL(subUrl, base).toString());
}

// ---------- 主流程 ----------
async function main() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const { input, ask } = makePrompt(rl);
    try {
        await runSync({ input, ask });
    } finally {
        rl.close();
    }
}

async function runSync({ input, ask }) {
    let origin;
    let upstream;
    let upstreamUrl;
    try {
        upstreamUrl = out('git', ['remote', 'get-url', 'upstream']);
        origin = parseRemote(out('git', ['remote', 'get-url', 'origin']));
        upstream = parseRemote(upstreamUrl);
    } catch {
        throw new Error('未找到 origin/upstream 远程，请先 fork 主仓库并配置这两个远程');
    }
    console.log(`fork:sync — ${origin.owner}/${origin.repo} ← ${upstream.owner}/${upstream.repo}`);

    // 解析子模块（创建检查与 upstream 同步共用）
    const subs = [];
    try {
        for (const s of parseGitmodules(readFileSync('.gitmodules', 'utf8'))) {
            try {
                subs.push({ path: s.path, upstream: resolveSubRepo(upstreamUrl, s.url) });
            } catch (e) {
                console.warn(`⚠ 跳过子模块 ${s.path}：${e.message}`);
            }
        }
    } catch { /* 没有 .gitmodules，忽略 */ }

    let token;
    const ensureToken = async () => { token = token ?? await resolveToken(input, ask); return token; };

    // 1. 主仓库 fork 不存在时询问创建
    if (!gitRemoteExists(origin.owner, origin.repo)) {
        const create = !NO_CREATE && (AUTO || await ask(`GitHub 上不存在 ${origin.owner}/${origin.repo}，是否创建 fork？`, false));
        if (create) {
            try {
                await ensureToken();
                const created = await createFork(upstream.owner, upstream.repo, origin.owner, token);
                if (created.owner !== origin.owner) {
                    run('git', ['remote', 'set-url', 'origin', `https://github.com/${created.owner}/${created.repo}.git`]);
                }
                console.log(`✔ 已创建 fork：${created.owner}/${created.repo}`);
            } catch (e) {
                console.warn(`⚠ 创建 ${origin.owner}/${origin.repo} 失败：${e.message}，继续同步`);
            }
        } else {
            console.warn(`⚠ 跳过创建 ${origin.owner}/${origin.repo}，本次仅从 upstream 拉取`);
        }
    }

    // 2. 子模块 fork 不存在时询问创建
    if (!NO_SUBS) {
        const missing = subs
            .filter((sub) => !gitRemoteExists(origin.owner, sub.upstream.repo))
            .map((sub) => ({ ...sub, fork: { owner: origin.owner, repo: sub.upstream.repo } }));
        if (missing.length > 0) {
            const list = missing.map((m) => `    ${m.fork.owner}/${m.fork.repo}  ←  ${m.upstream.owner}/${m.upstream.repo}`).join('\n');
            const create = !NO_CREATE && (AUTO || await ask(`GitHub 上缺少以下子仓库 fork，是否创建？\n${list}\n`, false));
            if (create) {
                try {
                    await ensureToken();
                } catch (e) {
                    console.warn(`⚠ 无法获取 GitHub Token，跳过子仓库创建：${e.message}`);
                }
                for (const m of missing) {
                    if (!token) break;
                    try {
                        const created = await createFork(m.upstream.owner, m.upstream.repo, m.fork.owner, token);
                        console.log(`✔ 已创建子仓库 fork：${created.owner}/${created.repo}（${m.path}）`);
                    } catch (e) {
                        console.warn(`⚠ 子仓库 ${m.path} 创建失败：${e.message}`);
                    }
                }
            } else {
                console.warn(`⚠ 跳过子仓库 fork 创建（${missing.map((m) => m.fork.repo).join('、')}）`);
            }
        }
    }

    // 3. 同步
    if (!NO_SYNC) {
        run('git', ['pull', 'upstream', 'main']);
        run('git', ['submodule', 'update', '--init', '--recursive']);
    } else {
        console.log('已跳过同步（--no-sync）');
    }

    // 4. 同步 upstream 远程地址（主仓库与各子模块）
    ensureUpstream('.', upstream);
    for (const sub of subs) ensureUpstream(sub.path, sub.upstream);
    run('git', ['config', '--local', 'ku2hakuasso.last-submodule-sync', new Date().toISOString()]);
    console.log('✔ 已记录同步状态；之后可执行 pnpm run fork:pr 提交 PR');
}

/** --store-token：交互输入 PAT 并存入 Windows 凭据管理器 */
async function storeTokenFlow() {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const { input } = makePrompt(rl);
    try {
        const token = await input('请粘贴用于创建 fork 的 Personal Access Token（需要 repo 权限，仅存入 Windows 凭据管理器）：');
        if (!token) throw new Error('未提供 Token');
        storeCredential(token);
        console.log(`✔ 已存入 Windows 凭据管理器（host=${CRED_HOST}），fork:sync 将静默读取`);
    } finally {
        rl.close();
    }
}

// 仅在直接执行时运行，便于被其他脚本 import 复用
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? '')).href) {
    const flow = STORE_TOKEN ? storeTokenFlow() : main();
    flow.catch((e) => {
        console.error(`✖ ${e.message}`);
        process.exitCode = 1;
    });
}
