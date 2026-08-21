import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirDisabled, filterEnabledDirs } from './local-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

// 从 projects.json 动态收集子项目目录，避免硬编码
const projects = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, 'projects.json'), 'utf-8'),
);
// 个人配置已禁用的子模块不参与同步（见 scripts/local-config.mjs）
const allDirs = projects.map((project) => project.dir);
const disabledDirs = allDirs.filter((d) => isDirDisabled(d));
if (disabledDirs.length) {
    console.log(`⏭️  个人配置（.repos.local.json）已禁用以下子模块，跳过同步: ${disabledDirs.join('、')}`);
}
const submoduleDirs = filterEnabledDirs(allDirs);

const remoteRepo = (cwd, remote) => {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', remote], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().replace(/\.git$/, '').replace(/\/$/, '');
    const match = url.match(/github\.com[/:]([^/]+)\/([^/]+)$/i);
    if (!match) throw new Error(`无法解析 ${cwd || '主仓库'} 的 ${remote}：${url}`);
    return { owner: match[1], repo: match[2], url };
};

const verifyForkOrigins = () => {
    const origin = remoteRepo(ROOT_DIR, 'origin');
    const upstream = remoteRepo(ROOT_DIR, 'upstream');
    if (origin.owner === upstream.owner && origin.repo === upstream.repo) {
        throw new Error(`主仓库 origin 仍指向 upstream：${origin.url}；请先配置 fork 的 origin`);
    }
    for (const dir of submoduleDirs) {
        const subOrigin = remoteRepo(path.resolve(ROOT_DIR, dir), 'origin');
        if (subOrigin.owner !== origin.owner) {
            throw new Error(`子模块 ${dir} 的 origin（${subOrigin.owner}/${subOrigin.repo}）与主仓库 origin（${origin.owner}/${origin.repo}）不属于同一 fork`);
        }
    }
    console.log(`✔ 已确认 origin fork：${origin.owner}/${origin.repo}（子模块同属该账号/组织）`);
};

// 读取 superproject 当前 HEAD 中记录的子模块 gitlink SHA（即更新前的旧 commit）
const getRecordedSha = (dir) => {
    const out = execFileSync('git', ['ls-tree', 'HEAD', dir], {
        encoding: 'utf-8',
        cwd: ROOT_DIR,
    }).trim();
    // 输出形如：160000 commit <sha>  <dir>
    return out ? out.split(/\s+/)[2] : null;
};

// 获取子模块当前 HEAD 的短 SHA 与提交主题
const getSubmoduleHeadInfo = (dir) => {
    const cwd = path.resolve(ROOT_DIR, dir);
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf-8', cwd }).trim();
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf-8', cwd }).trim();
    return { sha, subject };
};

// 从 `git submodule status` 中筛选本次实际更新的子模块目录（'+' 前缀表示 checkout 与索引记录不一致）
const getUpdatedSubmoduleDirs = (statusText) =>
    submoduleDirs.filter((dir) =>
        statusText.split('\n').some((line) => line.startsWith('+') && line.includes(dir)),
    );

// 生成单个子模块更新的提交信息（含旧/新 HEAD 与提交主题）
const buildSubmoduleCommitMessage = (dir) => {
    const oldSha = getRecordedSha(dir);
    const { sha: newSha, subject } = getSubmoduleHeadInfo(dir);
    const range = oldSha ? `${oldSha.slice(0, 7)}..${newSha}` : newSha;
    return `chore: update submodule ${dir}\n\n${dir}: ${range} ${subject}`;
};

// 推送所有子模块到各自 fork 的分支（detached HEAD 时跳过：其提交通常已在远程，或需手动 checkout 后推送）
const pushSubmodules = (when, quietDetached = false) => {
    for (const dir of submoduleDirs) {
        const subCwd = path.resolve(ROOT_DIR, dir);
        let subBranch;
        try {
            subBranch = execFileSync('git', ['-C', subCwd, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
        } catch {
            if (!quietDetached) console.log(`ℹ 子模块 ${dir} 处于 detached HEAD（${when}），跳过推送；如需推送请先 git checkout 到分支`);
            continue;
        }
        run('git', ['-C', subCwd, 'push', 'origin', subBranch]);
        console.log(`✔ 已推送子模块 ${dir} → origin/${subBranch}（${when}）`);
    }
};

verifyForkOrigins();
pushSubmodules('同步前');
run('git', ['submodule', 'update', '--remote', '--recursive']);
// 在 git add 之前捕获状态：'+' 前缀表示该子模块 checkout 的 commit 与索引记录不一致（本次被更新过）
// 若在 add 之后再查，索引会与 checkout 一致，'+' 前缀会消失
const submoduleStatus = execFileSync('git', ['submodule', 'status'], {
    encoding: 'utf-8',
    cwd: ROOT_DIR,
});
// Windows 下 pnpm 是 .cmd 包装，需经 shell 执行，否则 execFileSync 报 ENOENT
if (process.platform === 'win32') {
    execFileSync('pnpm install', { stdio: 'inherit', shell: true });
} else {
    run('pnpm', ['install']);
}
// 每个更新的子模块单独提交一次 gitlink 更新，避免单个 commit 过长
const updatedDirs = getUpdatedSubmoduleDirs(submoduleStatus);
for (const dir of updatedDirs) {
    run('git', ['add', dir]);
    try {
        run('git', ['diff', '--cached', '--quiet']);
    } catch {
        run('git', ['commit', '-m', buildSubmoduleCommitMessage(dir)]);
    }
}

// pnpm-lock.yaml 如有变化单独提交
run('git', ['add', 'pnpm-lock.yaml']);
try {
    run('git', ['diff', '--cached', '--quiet']);
} catch {
    run('git', ['commit', '-m', 'chore: update lockfile']);
}

// 全部自动 push：先再推一次子模块（保险，detached 静默跳过），再推送主仓库的
// gitlink/lockfile 更新到 fork（origin）。任何 push 失败都会抛错且不记录同步状态，
// 从而阻止 fork:pr 在未推送状态下执行。
pushSubmodules('同步后', true);

const branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], {
    encoding: 'utf-8',
    cwd: ROOT_DIR,
}).trim();
run('git', ['push', 'origin', branch]);
console.log(`✔ 已推送主仓库到 origin/${branch}`);

run('git', ['config', '--local', 'ku2hakuasso.last-submodule-sync', new Date().toISOString()]);
console.log('✔ 已记录同步状态；之后可执行 pnpm run fork:pr 提交 PR');
