// Source archives have no repository. Install hooks only in a real git worktree.
import { spawnSync } from 'node:child_process';
if (spawnSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }).status === 0) {
  const { setHooksFromConfig } = await import('simple-git-hooks');
  await setHooksFromConfig();
}
