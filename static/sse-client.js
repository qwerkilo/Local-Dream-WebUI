// 前端 SSE 消费模块。
//
// 本模块是 templates/index.html /generate 流程的接缝：
// - parse：把单个 SSE 事件块（"\\n\\n" 已切分）解析为 { type, data } 对象。
// - extractPercent：从 progress 事件 data 中提取百分比，是 percent 计算的单一来源。
// - events：把 fetch Response 的流式 body 切分为事件序列的异步迭代器。
//
// 不做 dispatch（complete/progress/error 各自分支由调用方决定）。
// 不知道 DOM、不知道 UI 文案、不知道具体业务——纯协议层。
//
// 在浏览器中通过 <script type="module" src="static/sse-client.js"> 加载；
// 在 bun:test 中通过 ES module 导入。

// progress 事件 data 中"总数"字段名的优先级表（取第一个有效值）。
// 与 sse.py 旧 progress_handler 的字段回退集合保持语义一致。
// 导出供调用方在 UI 展示时复用（如 "step X / total" 文本），保持单一来源。
export const TOTAL_FIELD_NAMES = ["total", "total_steps", "max_steps", "steps"];

// 把单个 SSE 事件块（"\\n\\n" 已切分）解析为 { type, data }。
//
// 行为遵循 SSE 规范：
// - 多行 data 用 "\\n" 拼接（与 sse.py parse_sse 对称）
// - 'event:' 设置 type；缺省时回退到 JSON data.type（兼容旧版 LD 把类型塞在 JSON 里）
// - [DONE] 哨兵返回 { type: null, data: "[DONE]" }（由 events() 识别并终止迭代）
// - 非法 JSON 或空 data → 返回 null（调用方跳过）
//
// 参数：
//   block - SSE 事件块字符串，单条事件的全部行（不含末尾的 "\\n\\n" 分隔）
// 返回：
//   { type, data } | null
export function parse(block) {
  if (typeof block !== "string" || !block.trim()) return null;

  let eventType = null;
  let dataStr = null;
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataStr = line.slice("data:".length).trim();
    }
  }
  if (dataStr === null) return null;

  // [DONE] 哨兵原样保留（events() 据此终止流）
  if (dataStr === "[DONE]") return { type: null, data: "[DONE]" };

  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return null;
  }

  // type 优先 SSE 'event:' 字段，回退 data.type
  const fallbackType = data && typeof data === "object" ? data.type : null;
  return { type: eventType || fallbackType || null, data };
}

// 从 progress 事件 data 中提取百分比。
//
// 字段识别（按优先级）：
// 1. data.percent（数字）→ 直接返回（clamp 到 0-100）
// 2. data.step + data.total/total_steps/max_steps/steps → round(step/total*100)
// 3. data.progress 浮点（0.0-1.0）→ ×100；浮点（0-100）→ 直接用
// 4. 字段缺失/非数字/总和为 0 → 返回 null
//
// 这是 percent 计算的**单一来源**——后端 sse.py 的 progress_handler 不再计算 percent，
// 避免两套语言、两种 ??/or 语义不一致的字段回退表。
export function extractPercent(data) {
  if (!data || typeof data !== "object") return null;

  // 1) data.percent 优先
  if (typeof data.percent === "number" && Number.isFinite(data.percent)) {
    return Math.max(0, Math.min(100, data.percent));
  }

  // 2) step + total 字段族
  const step = Number(data.step);
  if (Number.isFinite(step)) {
    for (const name of TOTAL_FIELD_NAMES) {
      const total = Number(data[name]);
      if (Number.isFinite(total) && total > 0) {
        return Math.round((step / total) * 100);
      }
    }
  }

  // 3) 单独 progress 浮点
  if (typeof data.progress === "number" && Number.isFinite(data.progress)) {
    const p = data.progress;
    if (p >= 0 && p <= 1) return Math.round(p * 100);
    if (p > 1 && p <= 100) return Math.round(p);
  }

  return null;
}

// 把 fetch Response 的流式 body 切分为事件序列的异步迭代器。
//
// 行为：
// - 按字节流读取，逐块追加到缓冲 buf
// - 按 "\\n\\n" 切分已完整的事件块；最后一段（可能不完整）留在 buf 等待下次读取
// - 调用 parse() 解析每块；[DONE] 时 return（不 yield）
// - signal abort 时抛 AbortError
// - 流结束（done）时正常 return
// - 完成后释放 reader
//
// 参数：
//   response - fetch Response 对象，需有 response.body.getReader()
//   options.signal - 可选 AbortSignal
// 返回：
//   AsyncIterable<{ type, data }>
export async function* events(response, options = {}) {
  const { signal } = options;
  if (!response || !response.body || typeof response.body.getReader !== "function") {
    throw new TypeError("events(response): response must have a ReadableStream body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  try {
    while (true) {
      if (signal && signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) return;

      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      // 最后一段可能是不完整块，留给下次
      buf = parts.pop();

      for (const block of parts) {
        if (!block.trim()) continue;
        const event = parse(block);
        if (event === null) continue;
        if (event.data === "[DONE]") return;
        yield event;
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 已经释放或流已关闭，忽略
    }
  }
}
