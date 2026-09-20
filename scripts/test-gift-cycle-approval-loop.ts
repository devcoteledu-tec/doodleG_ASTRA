// Compatibility entry point. Runs the real local PostgreSQL regression suite.
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['scripts/test-database.mjs'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
