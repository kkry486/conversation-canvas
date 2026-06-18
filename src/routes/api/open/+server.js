import { exec } from 'child_process';
import { promisify } from 'util';
import { resolve, dirname } from 'path';

const execAsync = promisify(exec);
const WORK_DIR = process.cwd();

/**
 * POST /api/open
 * mode: 'file'   → 用系统默认程序打开文件
 * mode: 'folder' → 在文件管理器中打开并选中文件
 */
export async function POST({ request }) {
  const { path: filePath, mode = 'file' } = await request.json();

  if (!filePath) {
    return new Response(JSON.stringify({ error: '缺少路径' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const resolved = resolve(WORK_DIR, filePath);
  if (!resolved.startsWith(WORK_DIR)) {
    return new Response(JSON.stringify({ error: '不允许访问项目目录之外的路径' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const platform = process.platform;
    const winPath = resolved.replace(/\//g, '\\');

    if (mode === 'folder') {
      // 打开文件夹并选中文件
      if (platform === 'win32') {
        await execAsync(`explorer.exe /select,"${winPath}"`);
      } else if (platform === 'darwin') {
        await execAsync(`open -R "${resolved}"`);
      } else {
        await execAsync(`xdg-open "${dirname(resolved)}"`);
      }
    } else {
      // 直接打开文件（用系统默认程序）
      if (platform === 'win32') {
        await execAsync(`start "" "${winPath}"`);
      } else if (platform === 'darwin') {
        await execAsync(`open "${resolved}"`);
      } else {
        await execAsync(`xdg-open "${resolved}"`);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
