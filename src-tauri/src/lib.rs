use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

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
            match Command::new("cmd")
                .args(["/C", cmd])
                .current_dir(work_dir)
                .output()
            {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let result = [stdout, stderr].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n");
                    (true, if result.is_empty() { "命令执行成功（无输出）".to_string() } else { result }, None, None)
                }
                Err(e) => (false, format!("执行失败: {e}"), None, None),
            }
        }
        "search_in_files" => {
            let query = match args.get("query").and_then(|v| v.as_str()) {
                Some(q) => q,
                None => return (false, "缺少 query 参数".to_string(), None, None),
            };
            let search_path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");
            match Command::new("cmd")
                .args(["/C", &format!("findstr /S /N /C:\"{query}\" {search_path}\\*.js {search_path}\\*.svelte {search_path}\\*.ts {search_path}\\*.json {search_path}\\*.md 2>nul")])
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
    tools: &[ToolDefinition],
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

    let tools = get_tool_definitions();
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

            // 执行
            let (success, content, file_path, file_name) =
                execute_tool(func_name, &parsed_args, &dir).await;

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
        .invoke_handler(tauri::generate_handler![
            chat,
            agent,
            open_file,
            set_work_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
