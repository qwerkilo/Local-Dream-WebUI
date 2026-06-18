// sse-client.js 单元测试（bun:test）
//
// 覆盖：
// - parse：event: 字段、data.type 回退、[DONE] 哨兵、非法 JSON、空块
// - extractPercent：data.percent 优先、step+total/total_steps/max_steps/steps 回退、
//   progress 浮点两种量纲、字段缺失/非数字返回 null
// - events：流式消费、[DONE] 终止、跨块缓冲、非完整块保留
//
// 运行：`bun test tests-js/sse-client.test.js` 或 `bun test`（项目根）

import { describe, test, expect } from "bun:test";
import { parse, extractPercent, events, TOTAL_FIELD_NAMES } from "../static/sse-client.js";

describe("parse", () => {
  test("event: 字段优先", () => {
    const block = 'event: complete\ndata: {"png_image":"abc"}';
    expect(parse(block)).toEqual({ type: "complete", data: { png_image: "abc" } });
  });

  test("无 event: 时回退到 data.type", () => {
    const block = 'data: {"type":"progress","step":1}';
    expect(parse(block)).toEqual({ type: "progress", data: { type: "progress", step: 1 } });
  });

  test("[DONE] 哨兵原样保留（不解析）", () => {
    expect(parse("data: [DONE]")).toEqual({ type: null, data: "[DONE]" });
  });

  test("非法 JSON 返回 null", () => {
    expect(parse("data: not-json{")).toBeNull();
  });

  test("空块 / 无 data 字段返回 null", () => {
    expect(parse("")).toBeNull();
    expect(parse("   \n  ")).toBeNull();
    expect(parse("event: complete")).toBeNull();
  });

  test("data 是字符串字面量也接受（type 走 event:）", () => {
    const block = 'event: complete\ndata: "raw-string"';
    expect(parse(block)).toEqual({ type: "complete", data: "raw-string" });
  });
});

describe("extractPercent", () => {
  test("data.percent 优先", () => {
    expect(extractPercent({ percent: 42 })).toBe(42);
  });

  test("data.percent clamp 到 0-100", () => {
    expect(extractPercent({ percent: 150 })).toBe(100);
    expect(extractPercent({ percent: -5 })).toBe(0);
  });

  test("step + total", () => {
    expect(extractPercent({ step: 5, total: 10 })).toBe(50);
  });

  test("step + total_steps（字段名回退）", () => {
    expect(extractPercent({ step: 3, total_steps: 4 })).toBe(75);
  });

  test("step + max_steps（字段名回退）", () => {
    expect(extractPercent({ step: 1, max_steps: 4 })).toBe(25);
  });

  test("step + steps（字段名回退）", () => {
    expect(extractPercent({ step: 7, steps: 10 })).toBe(70);
  });

  test("progress 浮点 0-1 量纲", () => {
    expect(extractPercent({ progress: 0.5 })).toBe(50);
  });

  test("progress 浮点 0-100 量纲", () => {
    expect(extractPercent({ progress: 33 })).toBe(33);
  });

  test("字段缺失 / 非数字 / total=0 → null", () => {
    expect(extractPercent({})).toBeNull();
    expect(extractPercent({ step: "x" })).toBeNull();
    expect(extractPercent({ step: 5, total: 0 })).toBeNull();
    expect(extractPercent({ step: 5, total: -1 })).toBeNull();
  });

  test("非对象输入（null/string）→ null", () => {
    expect(extractPercent(null)).toBeNull();
    expect(extractPercent("foo")).toBeNull();
    expect(extractPercent(42)).toBeNull();
  });
});

describe("TOTAL_FIELD_NAMES", () => {
  test("导出顺序：total / total_steps / max_steps / steps", () => {
    expect(TOTAL_FIELD_NAMES).toEqual(["total", "total_steps", "max_steps", "steps"]);
  });
});

// 构造一个可控的 fetch Response（用 ReadableStream 喂字节）。
function makeFakeResponse(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("events", () => {
  test("按 \n\n 切分，yield 已解析事件", async () => {
    const res = makeFakeResponse(['event: a\ndata: {"x":1}\n\nevent: b\ndata: {"y":2}\n\n']);
    const out = [];
    for await (const e of events(res)) out.push(e);
    expect(out).toEqual([
      { type: "a", data: { x: 1 } },
      { type: "b", data: { y: 2 } },
    ]);
  });

  test("[DONE] 时终止迭代（不 yield）", async () => {
    const res = makeFakeResponse([
      'event: a\ndata: {"x":1}\n\ndata: [DONE]\n\nevent: never\ndata: {"y":2}\n\n',
    ]);
    const out = [];
    for await (const e of events(res)) out.push(e);
    expect(out).toEqual([{ type: "a", data: { x: 1 } }]);
  });

  test("跨块缓冲：事件跨越多次 read 仍能正确切分", async () => {
    // 故意把一个事件切成三块喂入，验证 buf 拼接
    const res = makeFakeResponse([
      "event: prog",
      'ress\ndata: {"s',
      'tep":3,"total":4}\n\nevent: done\ndata: [DONE]\n\n',
    ]);
    const out = [];
    for await (const e of events(res)) out.push(e);
    expect(out).toEqual([{ type: "progress", data: { step: 3, total: 4 } }]);
  });

  test("无 body 抛 TypeError", async () => {
    const empty = {};
    let err = null;
    try {
      await events(empty).next();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TypeError);
  });
});
