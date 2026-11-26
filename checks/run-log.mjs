// run-log.mjs <id> <before|after>: runs checks/<id>.mjs, writes stdout+stderr and the exit code to checks/logs/<id>-<tag>.log
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const [id, tag] = process.argv.slice(2);
const r = spawnSync(process.execPath, [path.join(dir, id + '.mjs')], { encoding: 'utf8', timeout: 60000 });
const out = (r.stdout || '') + (r.stderr || '') + `exit ${r.status}${r.error ? ' ENV ' + r.error.message : ''}\n`;
fs.writeFileSync(path.join(dir, 'logs', `${id}-${tag}.log`), out);
process.stdout.write(out);
