// @ts-check
/**
 * 用 Playwright Codegen 录制登录+签到流程。
 * 录制结果写入 storage/codegen-latest.js，可用于对照更新选择器。
 */
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
dotenv.config({ path: join(root, 'config', '.env') });

const startUrl = process.env.LOGIN_URL || process.env.TARGET_URL;
if (!startUrl || startUrl.includes('example.com')) {
  console.error('❌ 请先在 config/.env 中配置有效的 LOGIN_URL / TARGET_URL');
  process.exit(1);
}

const outDir = join(root, 'storage');
const outFile = join(outDir, 'codegen-latest.js');
mkdirSync(outDir, { recursive: true });

console.log('========================================');
console.log('  Playwright 流程录制');
console.log('========================================');
console.log(`打开页面: ${startUrl}`);
console.log(`输出文件: ${outFile}`);
console.log('');
console.log('请在弹出的浏览器中完整操作一遍：');
console.log('  1. 登录（填账号密码 → 点登录）');
console.log('  2. 进入控制面板');
console.log('  3. 点击签到（立即续命）并确认弹窗');
console.log('  4. 操作完成后关闭浏览器窗口');
console.log('');
console.log('录制结束后关闭浏览器，结果会写入上面的输出文件。');
console.log('========================================');

const child = spawn(
  'npx',
  ['playwright', 'codegen', startUrl, '--target', 'javascript', '-o', outFile],
  {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  }
);

child.on('exit', (code) => {
  if (code === 0) {
    console.log('');
    console.log(`✅ 录制已保存: ${outFile}`);
    console.log('可用该文件对照更新 tests / utils 中的选择器');
  } else {
    console.error(`❌ 录制异常退出，code=${code}`);
  }
  process.exit(code ?? 1);
});
