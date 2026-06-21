mod mcp_client;

use mcp_client::OpenAiTool;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

// ═══════════════════════════════════════════════════
//  安全：命令黑名单
// ═══════════════════════════════════════════════════

/// 危险命令黑名单（不区分大小写）
const DANGEROUS_COMMANDS: &[&str] = &[
    // 文件系统破坏
    "rm -rf", "rm -f /", "rmdir /s /q", "del /f /s /q",
    "format", "format c:", "format d:",
    // 系统破坏
    "shutdown", "restart", "bootrec", "bcdedit",
    "reg delete", "regedit", "reg add",
    // 磁盘破坏
    "diskpart", "clean", "convert mbr", "convert gpt",
    // 权限提升
    "net user", "net localgroup", "runas",
    // 网络攻击
    "curl.*|.*sh", "wget.*|.*sh", "powershell.*invoke",
    // 危险脚本
    ":(){ :|:& };:",  // fork bomb
    "mkfs", "dd if=",
];

/// 检查命令是否包含危险操作
fn is_dangerous_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();
    DANGEROUS_COMMANDS.iter().any(|dangerous| {
        if dangerous.contains('*') {
            // 简单的通配符匹配
            let parts: Vec<&str> = dangerous.split('*').collect();
            if parts.len() == 2 {
                cmd_lower.contains(parts[0]) && cmd_lower.contains(parts[1])
            } else {
                cmd_lower.contains(dangerous)
            }
        } else {
            cmd_lower.contains(dangerous)
        }
    })
}

/// 命令执行超时时间（秒）
const COMMAND_TIMEOUT_SECS: u64 = 30;

// ═══════════════════════════════════════════════════
//  数据结构
// ═══════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDef {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub model: String,
    pub api_key: String,
    pub base_url: String,
    pub system_prompt: Option<String>,
    pub message: String,
    pub history: Option<Vec<ChatMessage>>,
    #[serde(default)]
    pub use_mcp: bool,
}

#[derive(Debug, Serialize)]
pub struct AgentEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iterations: Option<u32>,
}

// ═══════════════════════════════════════════════════
//  Agent 工作目录
// ═══════════════════════════════════════════════════

pub struct WorkDir(pub Mutex<PathBuf>);

pub struct McpState(pub Mutex<Option<mcp_client::McpClient>>);

// ═══════════════════════════════════════════════════
//  工具定义
// ═══════════════════════════════════════════════════

fn get_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDef {
                name: "read_file".to_string(),
                description: "读取指定文件的内容。只能使用相对路径（相对于工作目录），不要用绝对路径。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "要读取的文件路径（相对于工作目录）" }
                    },
                    "required": ["path"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDef {
                name: "write_file".to_string(),
                description: "创建或覆盖写入文件。这是创建文件的首选工具，不要用 execute_command 来创建文件。只能使用相对路径。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "要写入的文件路径" },
                        "content": { "type": "string", "description": "要写入的文件内容" }
                    },
                    "required": ["path", "content"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDef {
                name: "list_directory".to_string(),
                description: "列出目录下的文件和子目录。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "目录路径（默认为工作目录）" }
                    }
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDef {
                name: "execute_command".to_string(),
                description: "执行系统命令。用于运行脚本、安装依赖、查看系统信息等。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "command": { "type": "string", "description": "要执行的 shell 命令" }
                    },
                    "required": ["command"]
                }),
            },
        },
        ToolDefinition {
            tool_type: "function".to_string(),
            function: FunctionDef {
                name: "search_in_files".to_string(),
                description: "在项目文件中搜索文本内容。".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "要搜索的文本" },
                        "path": { "type": "string", "description": "搜索范围的目录" }
                    },
                    "required": ["query"]
                }),
            },
        },
    ]
}

// ═══════════════════════════════════════════════════
//  工具执行器
// ═══════════════════════════════════════════════════

fn safe_path(work_dir: &Path, input: &str) -> Result<PathBuf, String> {
    // 统一分隔符为反斜杠
    let normalized = input.replace('/', "\\");

    let resolved = if Path::new(&normalized).is_absolute() {
        PathBuf::from(&normalized)
    } else {
        work_dir.join(&normalized)
    };

    // 直接用字符串前缀比较（避免 Windows canonicalize 的 UNC 路径问题）
    let work_str = work_dir.to_string_lossy().replace('/', "\\");
    let target_str = resolved.to_string_lossy().replace('/', "\\");

    if !target_str.starts_with(&work_str) {
        return Err(format!("路径越界：{} 不在工作目录 {} 下", input, work_dir.display()));
    }

    Ok(resolved)
}

async fn execute_tool(
    name: &str,
    args: &serde_json::Value,
    work_dir: &Path,
) -> (bool, String, Option<String>, Option<String>) {
    match name {
        "read_file" => {
            let path = match args.get("path").and_then(|v| v.as_str()) {
                Some(p) => p,
                None => return (false, "缺少 path 参数".to_string(), None, None),
            };
            let full_path = match safe_path(work_dir, path) {
                Ok(p) => p,
                Err(e) => return (false, e, None, None),
            };
            match std::fs::read_to_string(&full_path) {
                Ok(content) => (true, content, Some(full_path.to_string_lossy().to_string()), Some(full_path.file_name().unwrap_or_default().to_string_lossy().to_string())),
                Err(e) => (false, format!("读取失败: {e}"), None, None),
            }
        }
        "write_file" => {
            let path = match args.get("path").and_then(|v| v.as_str()) {
                Some(p) => p,
                None => return (false, "缺少 path 参数".to_string(), None, None),
            };
            let content = match args.get("content").and_then(|v| v.as_str()) {
                Some(c) => c,
                None => return (false, "缺少 content 参数".to_string(), None, None),
            };
            let full_path = match safe_path(work_dir, path) {
                Ok(p) => p,
                Err(e) => return (false, e, None, None),
            };
            // 创建父目录
            if let Some(parent) = full_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match std::fs::write(&full_path, content) {
                Ok(()) => (
                    true,
                    format!("文件已写入: {path} ({} 字符)", content.len()),
                    Some(full_path.to_string_lossy().to_string()),
                    Some(full_path.file_name().unwrap_or_default().to_string_lossy().to_string()),
                ),
                Err(e) => (false, format!("写入失败: {e}"), None, None),
            }
        }
        "list_directory" => {
            let path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
            let full_path = match safe_path(work_dir, path) {
                Ok(p) => p,
                Err(e) => return (false, e, None, None),
            };
            match std::fs::read_dir(&full_path) {
                Ok(entries) => {
                    let listing: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .map(|e| {
                            let icon = if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                                "📁"
                            } else {
                                "📄"
                            };
                            format!("{icon} {}", e.file_name().to_string_lossy())
                        })
                        .collect();
                    (true, listing.join("\n"), None, None)
                }
                Err(e) => (false, format!("读取目录失败: {e}"), None, None),
            }
        }
        "execute_command" => {
            let cmd = match args.get("command").and_then(|v| v.as_str()) {
                Some(c) => c,
                None => return (false, "缺少 command 参数".to_string(), None, None),
            };

            // 安全检查：拒绝危险命令
            if is_dangerous_command(cmd) {
                return (false, format!("安全拒绝：该命令被标记为危险操作，已被拦截。\n命令内容: {cmd}"), None, None);
            }

            // 使用 tokio::process::Command 实现超时
            let output = tokio::time::timeout(
                Duration::from_secs(COMMAND_TIMEOUT_SECS),
                tokio::process::Command::new("cmd")
                    .args(["/C", cmd])
                    .current_dir(work_dir)
                    .output()
            ).await;

            match output {
                Ok(Ok(output)) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let result = [stdout, stderr].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n");
                    (true, if result.is_empty() { "命令执行成功（无输出）".to_string() } else { result }, None, None)
                }
                Ok(Err(e)) => (false, format!("执行失败: {e}"), None, None),
                Err(_) => (false, format!("命令执行超时（{}秒）: {cmd}", COMMAND_TIMEOUT_SECS), None, None),
            }
        }
        "search_in_files" => {
            let query = match args.get("query").and_then(|v| v.as_str()) {
                Some(q) => q,
                None => return (false, "缺少 query 参数".to_string(), None, None),
            };
            let search_path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");

            // 构建搜索路径列表
            let extensions = ["js", "svelte", "ts", "json", "md"];
            let search_paths: Vec<String> = extensions.iter()
                .map(|ext| format!("{}\\*.{}", search_path, ext))
                .collect();

            // 使用参数化调用，避免命令注入
            // findstr 的 /C: 参数需要特殊处理，使用文件参数形式更安全
            let mut cmd_args = vec!["/C", "findstr", "/S", "/N"];
            let query_arg = format!("/C:{}", query);
            cmd_args.push(&query_arg);
            for path in &search_paths {
                cmd_args.push(path);
            }

            match Command::new("cmd")
                .args(&cmd_args)
                .current_dir(work_dir)
                .output()
            {
                Ok(output) => {
                    let result = String::from_utf8_lossy(&output.stdout).to_string();
                    (true, if result.is_empty() { format!("未找到包含 \"{query}\" 的内容") } else { result }, None, None)
                }
                Err(e) => (false, format!("搜索失败: {e}"), None, None),
            }
        }
        _ => (false, format!("未知工具: {name}"), None, None),
    }
}

// ═══════════════════════════════════════════════════
//  调用 LLM API
// ═══════════════════════════════════════════════════

#[derive(Debug, Deserialize)]
struct LLMResponse {
    choices: Vec<LLMChoice>,
}

#[derive(Debug, Deserialize)]
struct LLMChoice {
    message: LLMMessage,
}

#[derive(Debug, Deserialize)]
struct LLMMessage {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCall>>,
}

async fn call_llm(
    base_url: &str,
    api_key: &str,
    model: &str,
    messages: &[ChatMessage],
    tools: &[serde_json::Value],
) -> Result<(Option<String>, Option<Vec<ToolCall>>), String> {
    let client = reqwest::Client::new();

    let mut body = serde_json::json!({
        "model": model,
        "messages": messages,
        "tools": tools,
        "tool_choice": "auto",
        "stream": false
    });

    // 如果没有工具，不传 tools 字段
    if tools.is_empty() {
        body.as_object_mut().unwrap().remove("tools");
        body.as_object_mut().unwrap().remove("tool_choice");
    }

    let url = format!("{base_url}/chat/completions");

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误 ({status}): {text}"));
    }

    let resp: LLMResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;

    let choice = resp.choices.first().ok_or("LLM 返回空响应")?;
    let text = choice.message.content.clone();
    let tool_calls = choice.message.tool_calls.clone();

    Ok((text, tool_calls))
}

// ═══════════════════════════════════════════════════
//  Tauri 命令
// ═══════════════════════════════════════════════════

#[tauri::command]
async fn chat(
    request: ChatRequest,
    work_dir: State<'_, WorkDir>,
) -> Result<String, String> {
    let _dir = work_dir.0.lock().await;

    let mut messages: Vec<ChatMessage> = Vec::new();

    if let Some(sp) = &request.system_prompt {
        if !sp.trim().is_empty() {
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: Some(sp.trim().to_string()),
                tool_calls: None,
                tool_call_id: None,
            });
        }
    }

    if let Some(history) = &request.history {
        messages.extend(history.clone());
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: Some(request.message),
        tool_calls: None,
        tool_call_id: None,
    });

    let (text, _tool_calls) = call_llm(
        &request.base_url,
        &request.api_key,
        &request.model,
        &messages,
        &[],
    )
    .await?;

    Ok(text.unwrap_or_default())
}

#[tauri::command]
async fn agent(
    request: ChatRequest,
    work_dir: State<'_, WorkDir>,
    mcp_state: State<'_, McpState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let dir = work_dir.0.lock().await.clone();

    let mut messages: Vec<ChatMessage> = Vec::new();

    // Agent 系统提示（附加在用户 system_prompt 之后）
    let agent_system_prompt = "你是一个能调用本地工具的 AI 助手。\n\
        重要规则：\n\
        1. 所有文件路径必须使用相对路径（相对于当前工作目录），不要使用绝对路径\n\
        2. 每次调用工具后，必须用文字向用户报告工具的执行结果（成功或失败）\n\
        3. 如果工具执行失败，告诉用户失败原因并建议解决方案\n\
        4. 完成所有工具调用后，给用户一个完整的总结";

    let full_system = if let Some(sp) = &request.system_prompt {
        if !sp.trim().is_empty() {
            format!("{}\n\n{}", sp.trim(), agent_system_prompt)
        } else {
            agent_system_prompt.to_string()
        }
    } else {
        agent_system_prompt.to_string()
    };

    messages.push(ChatMessage {
        role: "system".to_string(),
        content: Some(full_system),
        tool_calls: None,
        tool_call_id: None,
    });

    if let Some(history) = &request.history {
        messages.extend(history.clone());
    }

    messages.push(ChatMessage {
        role: "user".to_string(),
        content: Some(request.message),
        tool_calls: None,
        tool_call_id: None,
    });

    // 获取工具列表：优先用 MCP 工具，否则用内置工具
    let tools: Vec<serde_json::Value> = if request.use_mcp {
        let mcp = mcp_state.0.lock().await;
        if let Some(client) = mcp.as_ref() {
            match client.list_tools().await {
                Ok(mcp_tools) => {
                    mcp_tools.iter().map(|t| {
                        let tool = t.to_openai_tool();
                        serde_json::to_value(tool).unwrap()
                    }).collect()
                }
                Err(e) => {
                    let _ = app.emit("agent-event", serde_json::json!({
                        "type": "error",
                        "content": format!("获取 MCP 工具失败: {e}，使用内置工具")
                    }));
                    get_tool_definitions().iter().map(|t| serde_json::to_value(t).unwrap()).collect()
                }
            }
        } else {
            get_tool_definitions().iter().map(|t| serde_json::to_value(t).unwrap()).collect()
        }
    } else {
        get_tool_definitions().iter().map(|t| serde_json::to_value(t).unwrap()).collect()
    };
    let max_iterations = 10;

    for _ in 0..max_iterations {
        let (text, tool_calls) = call_llm(
            &request.base_url,
            &request.api_key,
            &request.model,
            &messages,
            &tools,
        )
        .await?;

        // 推送思考/文本
        if let Some(t) = &text {
            if !t.is_empty() {
                let _ = app.emit("agent-event", serde_json::json!({
                    "type": "text_delta",
                    "content": t
                }));
            }
        }

        // 没有工具调用 → 完成
        let calls = match tool_calls {
            Some(c) if !c.is_empty() => c,
            _ => {
                let _ = app.emit("agent-event", serde_json::json!({
                    "type": "done",
                    "content": text.unwrap_or_default()
                }));
                return Ok(());
            }
        };

        // 执行工具
        for tc in &calls {
            let func_name = &tc.function.name;
            let parsed_args: serde_json::Value =
                serde_json::from_str(&tc.function.arguments).unwrap_or(serde_json::json!({}));

            // execute_command 前：记录目录文件列表
            let files_before: Vec<String> = if func_name == "execute_command" {
                std::fs::read_dir(&dir)
                    .map(|entries| entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect()
                    )
                    .unwrap_or_default()
            } else {
                vec![]
            };

            // 推送工具调用
            let _ = app.emit("agent-event", serde_json::json!({
                "type": "tool_call",
                "id": tc.id,
                "name": func_name,
                "arguments": parsed_args
            }));

            // 执行：优先用 MCP，否则用内置工具
            let (success, content, file_path, file_name) = if request.use_mcp {
                let mcp = mcp_state.0.lock().await;
                if let Some(client) = mcp.as_ref() {
                    match client.call_tool(func_name, parsed_args.clone()).await {
                        Ok(result) => (true, result, None, None),
                        Err(e) => (false, format!("MCP 工具执行失败: {e}"), None, None),
                    }
                } else {
                    execute_tool(func_name, &parsed_args, &dir).await
                }
            } else {
                execute_tool(func_name, &parsed_args, &dir).await
            };

            // execute_command 后：检测新文件
            if func_name == "execute_command" && success {
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    let files_after: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect();

                for fname in &files_after {
                    if !files_before.contains(fname) {
                        let full_path = dir.join(fname).to_string_lossy().to_string();
                        let _ = app.emit("agent-event", serde_json::json!({
                            "type": "tool_result",
                            "id": format!("{}_file", tc.id),
                            "name": "write_file",
                            "success": true,
                            "content": format!("检测到新文件: {fname}"),
                            "filePath": full_path,
                            "fileName": fname
                        }));
                    }
                }
                } // if let Ok(entries)
            }

            // 推送工具结果
            let mut result = serde_json::json!({
                "type": "tool_result",
                "id": tc.id,
                "name": func_name,
                "success": success,
                "content": content
            });
            if let Some(fp) = &file_path {
                result["filePath"] = serde_json::json!(fp);
            }
            if let Some(fn_) = &file_name {
                result["fileName"] = serde_json::json!(fn_);
            }
            let _ = app.emit("agent-event", result);

            // 加入消息历史
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: text.clone(),
                tool_calls: Some(vec![tc.clone()]),
                tool_call_id: None,
            });
            messages.push(ChatMessage {
                role: "tool".to_string(),
                content: Some(content),
                tool_calls: None,
                tool_call_id: Some(tc.id.clone()),
            });
        }
    }

    let _ = app.emit("agent-event", serde_json::json!({
        "type": "done",
        "content": "",
        "warning": "达到最大迭代次数"
    }));

    Ok(())
}

#[tauri::command]
fn open_file(path: String, mode: String) -> Result<(), String> {
    let path = path.replace('/', "\\");

    if mode == "folder" {
        Command::new("explorer.exe")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn set_work_dir(path: String, work_dir: State<'_, WorkDir>) {
    *work_dir.0.blocking_lock() = PathBuf::from(path);
}

// ═══════════════════════════════════════════════════
//  MCP 命令
// ═══════════════════════════════════════════════════

#[tauri::command]
async fn mcp_connect(command: String, args: Vec<String>, mcp_state: State<'_, McpState>) -> Result<Vec<serde_json::Value>, String> {
    // 断开旧连接
    {
        let mut state = mcp_state.0.lock().await;
        if state.is_some() {
            state.take().unwrap().close().await;
        }
    }

    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let client = mcp_client::McpClient::connect(&command, &arg_refs).await?;

    // 获取工具列表
    let tools = client.list_tools().await?;
    let openai_tools: Vec<serde_json::Value> = tools.iter().map(|t| {
        let tool = t.to_openai_tool();
        serde_json::to_value(tool).unwrap()
    }).collect();

    // 保存连接
    {
        let mut state = mcp_state.0.lock().await;
        *state = Some(client);
    }

    Ok(openai_tools)
}

#[tauri::command]
async fn mcp_list_tools(mcp_state: State<'_, McpState>) -> Result<Vec<serde_json::Value>, String> {
    let state = mcp_state.0.lock().await;
    let client = state.as_ref().ok_or("MCP 未连接")?;
    let tools = client.list_tools().await?;
    let openai_tools: Vec<serde_json::Value> = tools.iter().map(|t| {
        let tool = t.to_openai_tool();
        serde_json::to_value(tool).unwrap()
    }).collect();
    Ok(openai_tools)
}

#[tauri::command]
async fn mcp_call_tool(name: String, arguments: serde_json::Value, mcp_state: State<'_, McpState>) -> Result<String, String> {
    let state = mcp_state.0.lock().await;
    let client = state.as_ref().ok_or("MCP 未连接")?;
    client.call_tool(&name, arguments).await
}

#[tauri::command]
async fn mcp_disconnect(mcp_state: State<'_, McpState>) -> Result<(), String> {
    let mut state = mcp_state.0.lock().await;
    if let Some(client) = state.take() {
        client.close().await;
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub model: String,
    pub api_key: String,
    pub base_url: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_true")]
    pub remember: bool,
}

fn default_true() -> bool { true }

fn config_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    config_dir.join("conversation-canvas").join("config.json")
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("写入配置失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn load_config() -> Result<Option<AppConfig>, String> {
    let path = config_path();
    if !path.exists() {
        return Ok(None);
    }
    let json = std::fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {e}"))?;
    let config: AppConfig = serde_json::from_str(&json).map_err(|e| format!("解析配置失败: {e}"))?;
    Ok(Some(config))
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    depth: usize,
}

#[tauri::command]
fn read_dir_recursive(path: String, max_depth: usize) -> Result<Vec<DirEntry>, String> {
    let max = if max_depth == 0 { 3 } else { max_depth };
    let mut entries = Vec::new();
    fn scan(dir: &Path, depth: usize, max: usize, entries: &mut Vec<DirEntry>) -> Result<(), String> {
        if depth > max { return Ok(()); }
        let mut items: Vec<_> = std::fs::read_dir(dir)
            .map_err(|e| format!("读取目录失败: {e}"))?
            .filter_map(|e| e.ok())
            .collect();
        items.sort_by(|a, b| {
            let a_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);
            b_dir.cmp(&a_dir).then_with(|| a.file_name().cmp(&b.file_name()))
        });
        for item in items {
            let name = item.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == ".git" {
                continue;
            }
            let is_dir = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let full_path = item.path().to_string_lossy().to_string();
            entries.push(DirEntry {
                name,
                path: full_path.clone(),
                is_dir,
                depth,
            });
            if is_dir {
                scan(&Path::new(&full_path), depth + 1, max, entries)?;
            }
        }
        Ok(())
    }
    scan(&Path::new(&path), 0, max, &mut entries)?;
    Ok(entries)
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {e}"))
}

fn config_dir() -> PathBuf {
    dirs::config_dir().unwrap_or_else(|| PathBuf::from("."))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: String,
    #[serde(default)]
    pub connected: bool,
}

#[tauri::command]
fn load_mcp_config() -> Result<Vec<McpServerConfig>, String> {
    let path = config_dir().join("conversation-canvas").join("mcp.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = std::fs::read_to_string(&path).map_err(|e| format!("读取失败: {e}"))?;
    let config: Vec<McpServerConfig> = serde_json::from_str(&json).map_err(|e| format!("解析失败: {e}"))?;
    Ok(config)
}

#[tauri::command]
fn save_mcp_config(config: Vec<McpServerConfig>) -> Result<(), String> {
    let path = config_dir().join("conversation-canvas").join("mcp.json");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("写入失败: {e}"))?;
    Ok(())
}

#[tauri::command]
fn install_npm_package(package_name: String, command: String) -> Result<String, String> {
    // 先检查命令是否已存在
    let which = if cfg!(target_os = "windows") { "where" } else { "which" };
    let check = Command::new(which).arg(&command).output();
    if let Ok(output) = check {
        if output.status.success() {
            return Ok(format!("{} 已安装，无需重复安装", package_name));
        }
    }

    // 不存在则安装
    let npm = if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" };
    let output = Command::new(npm)
        .args(["install", "-g", &package_name])
        .output()
        .map_err(|e| format!("执行 npm 失败: {e}"))?;

    if output.status.success() {
        Ok(format!("{} 安装成功", package_name))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("安装失败: {}", stderr))
    }
}

#[tauri::command]
fn find_claude_path() -> Result<String, String> {
    // 在常见路径中查找 claude CLI
    let home = dirs::home_dir().ok_or("无法获取用户目录")?;
    let candidates = if cfg!(target_os = "windows") {
        vec![
            home.join("AppData/Roaming/npm/claude.cmd"),
            home.join("AppData/Local/npm/claude.cmd"),
            PathBuf::from("C:/Program Files/nodejs/claude.cmd"),
        ]
    } else {
        vec![
            home.join(".npm-global/bin/claude"),
            home.join(".local/bin/claude"),
            PathBuf::from("/usr/local/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
        ]
    };

    for path in &candidates {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // 尝试 which/where
    let which = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(output) = Command::new(which).arg("claude").output() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !stdout.is_empty() && !stdout.contains("INFO") {
            // 取第一行
            let first_line = stdout.lines().next().unwrap_or("").trim().to_string();
            if !first_line.is_empty() {
                return Ok(first_line);
            }
        }
    }

    Err("找不到 claude CLI，请确认已安装：npm install -g @anthropic-ai/claude-code".to_string())
}

// ═══════════════════════════════════════════════════
//  入口
// ═══════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let default_dir = dirs::document_dir()
        .or_else(|| dirs::home_dir())
        .unwrap_or_else(|| PathBuf::from("."));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(WorkDir(Mutex::new(default_dir)))
        .manage(McpState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            chat,
            agent,
            open_file,
            set_work_dir,
            mcp_connect,
            mcp_list_tools,
            mcp_call_tool,
            mcp_disconnect,
            find_claude_path,
            save_config,
            load_config,
            load_mcp_config,
            save_mcp_config,
            install_npm_package,
            read_dir_recursive,
            read_file_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
