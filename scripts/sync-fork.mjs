import { execFileSync } from 'node:child_process';

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' });

run('git', ['pull', 'upstream', 'main']);
run('git', ['submodule', 'update', '--init', '--recursive']);