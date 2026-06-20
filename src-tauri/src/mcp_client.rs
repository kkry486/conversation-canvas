use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// ═══════════════════════════════════════════════════
//  MCP 协议数据结构
// ═══════════════════════════════════════════════════

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    #[serde(default)]
    pub result: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
}

// ═══════════════════════════════════════════════════
//  MCP 工具定义（转换为 OpenAI format 用）
// ═══════════════════════════════════════════════════

#[derive(Debug, Clone, Deserialize)]
pub struct McpTool {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default, rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenAiTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: OpenAiFunction,
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenAiFunction {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

impl McpTool {
    pub fn to_openai_tool(&self) -> OpenAiTool {
        OpenAiTool {
            tool_type: "function".to_string(),
            function: OpenAiFunction {
                name: self.name.clone(),
                description: self.description.clone(),
                parameters: if self.input_schema.is_null() {
                    serde_json::json!({"type": "object", "properties": {}})
                } else {
                    self.input_schema.clone()
                },
            },
        }
    }
}

// ═══════════════════════════════════════════════════
//  MCP Client
// ═══════════════════════════════════════════════════

pub struct McpClient {
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
    pending: Arc<Mutex<Vec<(u64, tokio::sync::oneshot::Sender<JsonRpcResponse>)>>>,
    next_id: AtomicU64,
}

impl McpClient {
    /// 启动 MCP Server 子进程并建立连接
    pub async fn connect(command: &str, args: &[&str]) -> Result<Self, String> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 MCP Server 失败: {e}"))?;

        let stdin = child.stdin.take().ok_or("无法获取 stdin")?;
        let stdout = child.stdout.take().ok_or("无法获取 stdout")?;

        let client = McpClient {
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            pending: Arc::new(Mutex::new(Vec::new())),
            next_id: AtomicU64::new(1),
        };

        // 启动 stdout 读取线程
        let pending = client.pending.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        // MCP 协议：每行一个 JSON-RPC 消息
                        match serde_json::from_str::<JsonRpcResponse>(trimmed) {
                            Ok(resp) => {
                                let mut pending = pending.lock().await;
                                if let Some(idx) = pending.iter().position(|(id, _)| *id == resp.id.unwrap_or(0)) {
                                    let (_, tx) = pending.remove(idx);
                                    let _ = tx.send(resp);
                                }
                            }
                            Err(_) => {} // 忽略非 JSON 行（日志等）
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        // 发送 initialize 握手
        client.initialize().await?;

        Ok(client)
    }

    /// 发送 JSON-RPC 请求并等待响应
    async fn request(&self, method: &str, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);

        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id,
            method: method.to_string(),
            params,
        };

        let json = serde_json::to_string(&req).map_err(|e| format!("序列化失败: {e}"))?;

        // 发送到 stdin
        {
            let mut stdin = self.stdin.lock().await;
            stdin.write_all(json.as_bytes()).await.map_err(|e| format!("写入 stdin 失败: {e}"))?;
            stdin.write_all(b"\n").await.map_err(|e| format!("写入换行失败: {e}"))?;
            stdin.flush().await.map_err(|e| format!("flush 失败: {e}"))?;
        }

        // 等待响应
        let (tx, rx) = tokio::sync::oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.push((id, tx));
        }

        match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
            Ok(Ok(resp)) => {
                if let Some(err) = resp.error {
                    Err(format!("MCP 错误 {}: {}", err.code, err.message))
                } else {
                    Ok(resp.result.unwrap_or(serde_json::Value::Null))
                }
            }
            Ok(Err(_)) => Err("响应通道关闭".to_string()),
            Err(_) => Err("请求超时（30秒）".to_string()),
        }
    }

    /// MCP initialize 握手
    async fn initialize(&self) -> Result<(), String> {
        let params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "conversation-canvas",
                "version": "0.5.0"
            }
        });

        self.request("initialize", Some(params)).await?;

        // 发送 initialized 通知
        let notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        let json = serde_json::to_string(&notification).unwrap();
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(json.as_bytes()).await.map_err(|e| format!("写入通知失败: {e}"))?;
        stdin.write_all(b"\n").await.unwrap();
        stdin.flush().await.unwrap();

        Ok(())
    }

    /// 获取工具列表
    pub async fn list_tools(&self) -> Result<Vec<McpTool>, String> {
        let result = self.request("tools/list", None).await?;
        let tools: Vec<McpTool> = serde_json::from_value(
            result.get("tools").cloned().unwrap_or(serde_json::json!([]))
        ).map_err(|e| format!("解析工具列表失败: {e}"))?;
        Ok(tools)
    }

    /// 调用工具
    pub async fn call_tool(&self, name: &str, arguments: serde_json::Value) -> Result<String, String> {
        let params = serde_json::json!({
            "name": name,
            "arguments": arguments
        });

        let result = self.request("tools/call", Some(params)).await?;

        // 解析返回内容
        if let Some(content) = result.get("content") {
            if let Some(arr) = content.as_array() {
                let texts: Vec<String> = arr
                    .iter()
                    .filter_map(|item| {
                        if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                            item.get("text").and_then(|t| t.as_str()).map(|s| s.to_string())
                        } else {
                            None
                        }
                    })
                    .collect();
                return Ok(texts.join("\n"));
            }
        }

        Ok(result.to_string())
    }

    /// 关闭连接
    pub async fn close(&self) {
        let mut child = self.child.lock().await;
        let _ = child.kill().await;
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        // 同步 drop，只标记需要关闭
        // 实际关闭在 close() 中异步完成
    }
}
