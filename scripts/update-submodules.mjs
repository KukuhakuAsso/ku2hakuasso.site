import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

// 从 projects.json 动态收集子项目目录，避免硬编码
const projects = JSON.parse(
    fs.readFileSync(path.resolve(ROOT_DIR, 'projects.json'), 'utf-8'),
);
const submoduleDirs = projects.map((project) => project.dir);

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

run('git', ['submodule', 'foreach', '--recursive', 'git', 'push']);
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
