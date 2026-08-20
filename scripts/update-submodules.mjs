import { execFileSync } from 'node:child_process';

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

run('git', ['submodule', 'foreach', '--recursive', 'git', 'push']);
run('git', ['submodule', 'update', '--remote', '--recursive']);
run('pnpm', ['install']);
run('git', ['add', 'pnpm-lock.yaml', 'vue-mistarg2anns', 'vue-TelemetryInstruments']);

try {
    run('git', ['diff', '--cached', '--quiet']);
} catch {
    run('git', ['commit', '-m', 'chore: update submodules and lockfile']);
}