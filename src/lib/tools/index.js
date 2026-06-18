/**
 * Agent 工具定义与执行器
 * 定义 Agent 可以调用的工具，以及实际执行逻辑
 */

import { readFile, writeFile, readdir, stat, access } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 工作目录（默认当前项目根目录）
const WORK_DIR = process.cwd();

// ═══════════════════════════════════════════════════
//  工具定义（OpenAI function calling 格式）
// ═══════════════════════════════════════════════════

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定文件的内容。用于查看代码、配置文件、文档等。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径（相对于项目根目录）'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '创建或覆盖写入文件。用于创建新文件或完全重写文件内容。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要写入的文件路径（相对于项目根目录）'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: '列出目录下的文件和子目录。用于浏览项目结构。',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要列出的目录路径（相对于项目根目录），默认为项目根目录'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: '执行系统命令（shell 命令）。用于运行脚本、安装依赖、查看系统信息等。注意：命令在项目根目录下执行。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的 shell 命令'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_in_files',
      description: '在项目文件中搜索文本内容。用于查找特定代码、函数、变量等。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '要搜索的文本或正则表达式'
          },
          path: {
            type: 'string',
            description: '搜索范围的目录路径（默认为项目根目录）'
          }
        },
        required: ['query']
      }
    }
  }
];

// ═══════════════════════════════════════════════════
//  工具执行器
// ═══════════════════════════════════════════════════

function safePath(relativePath) {
  const resolved = resolve(WORK_DIR, relativePath);
  if (!resolved.startsWith(WORK_DIR)) {
    throw new Error('路径越界：不允许访问项目目录之外的文件');
  }
  return resolved;
}

async function executeTool(name, args) {
  try {
    switch (name) {
      case 'read_file': {
        const filePath = safePath(args.path);
        await access(filePath);
        const content = await readFile(filePath, 'utf-8');
        return { success: true, content };
      }

      case 'write_file': {
        const filePath = safePath(args.path);
        await writeFile(filePath, args.content, 'utf-8');
        return {
          success: true,
          content: `文件已写入: ${args.path} (${args.content.length} 字符)`,
          filePath: filePath,
          fileName: args.path.split('/').pop()
        };
      }

      case 'list_directory': {
        const dirPath = safePath(args.path || '.');
        const entries = await readdir(dirPath, { withFileTypes: true });
        const listing = entries.map(e => {
          const type = e.isDirectory() ? '📁' : '📄';
          return `${type} ${e.name}`;
        }).join('\n');
        return { success: true, content: listing || '（空目录）' };
      }

      case 'execute_command': {
        const result = await execAsync(args.command, {
          cwd: WORK_DIR,
          timeout: 30000,
          maxBuffer: 1024 * 1024
        });
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        return {
          success: true,
          content: output || '命令执行成功（无输出）'
        };
      }

      case 'search_in_files': {
        // 用 grep 实现简单搜索
        const searchPath = args.path || '.';
        const result = await execAsync(
          `grep -rn "${args.query}" "${searchPath}" --include="*.{js,svelte,ts,json,md,css,html}" 2>/dev/null | head -50`,
          { cwd: WORK_DIR, timeout: 15000 }
        );
        return {
          success: true,
          content: result.stdout || `未找到包含 "${args.query}" 的内容`
        };
      }

      default:
        return { success: false, content: `未知工具: ${name}` };
    }
  } catch (err) {
    return { success: false, content: `执行失败: ${err.message}` };
  }
}

// ═══════════════════════════════════════════════════
//  Agent 循环（tool-use loop）
// ═══════════════════════════════════════════════════

const MAX_ITERATIONS = 10;

/**
 * 执行 Agent 循环，通过 SSE 流式推送每一步
 * @param {object} options
 * @param {Function} options.sendEvent - 发送 SSE 事件的函数
 * @param {Function} options.callLLM - 调用 LLM 的函数，返回 { text, tool_calls, finish_reason }
 */
export async function runAgentLoop({ messages, tools, sendEvent, callLLM, systemPrompt }) {
  const allMessages = [...messages];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // 调用 LLM
    const response = await callLLM(allMessages, tools);

    // 推送思考过程
    if (response.thinking) {
      sendEvent('thinking', { content: response.thinking });
    }

    // 推送文本内容（流式增量）
    if (response.text) {
      sendEvent('text_delta', { content: response.text });
    }

    // 没有工具调用 → Agent 完成
    if (!response.tool_calls || response.tool_calls.length === 0) {
      sendEvent('done', {
        content: response.text || '',
        iterations: i + 1
      });
      return response.text || '';
    }

    // 有工具调用 → 逐个执行
    for (const toolCall of response.tool_calls) {
      const { name, arguments: args } = toolCall.function;
      const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

      // 推送工具调用
      sendEvent('tool_call', {
        id: toolCall.id,
        name,
        arguments: parsedArgs
      });

      // 执行工具
      const result = await executeTool(name, parsedArgs);

      // 推送工具结果
      const toolResult = {
        id: toolCall.id,
        name,
        success: result.success,
        content: result.content
      };
      if (result.filePath) toolResult.filePath = result.filePath;
      if (result.fileName) toolResult.fileName = result.fileName;
      sendEvent('tool_result', toolResult);

      // 把工具调用和结果加入消息历史
      allMessages.push({
        role: 'assistant',
        content: response.text || null,
        tool_calls: [toolCall]
      });
      allMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result.content
      });
    }
  }

  sendEvent('done', {
    content: '',
    iterations: MAX_ITERATIONS,
    warning: '达到最大迭代次数'
  });
}

export { executeTool };
