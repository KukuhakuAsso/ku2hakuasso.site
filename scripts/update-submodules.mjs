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

run('git', ['submodule', 'foreach', '--recursive', 'git', 'push']);
run('git', ['submodule', 'update', '--remote', '--recursive']);
// Windows 下 pnpm 是 .cmd 包装，需经 shell 执行，否则 execFileSync 报 ENOENT
if (process.platform === 'win32') {
    execFileSync('pnpm install', { stdio: 'inherit', shell: true });
} else {
    run('pnpm', ['install']);
}
run('git', ['add', 'pnpm-lock.yaml', ...submoduleDirs]);

try {
    run('git', ['diff', '--cached', '--quiet']);
} catch {
    run('git', ['commit', '-m', 'chore: update submodules and lockfile']);
}
