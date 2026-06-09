// params.js → createParamsPayload 单元测试（bun:test）
//
// 覆盖：
// - 默认 rules 内置，零参数可调用
// - 每个字段的 omitIf 规则（prompt/neg 不省；scheduler 空字符串省；karras/use_opencl 非 true 省；
//   clip_skip 非整数 >1 省；seed null 省；local_dream_url 空省）
// - 每个字段的 postProcess（prompt trim；ldUrl 加 http；steps 整数；cfg 浮点）
// - presetMode 白名单：denoise_strength/mode 进；seed/use_opencl/local_dream_url 不进
// - 纯函数性：同输入同输出
//
// 运行：`bun test tests-js/params-payload.test.js` 或 `bun test`

import { describe, test, expect } from "bun:test";
import { createParamsPayload, redactBinaries, PRESET_FIELDS } from "../static/params.js";

describe("createParamsPayload - 基础构造", () => {
  test("零参数调用：返回带 fromForm 方法的 payload", () => {
    const payload = createParamsPayload();
    expect(typeof payload.fromForm).toBe("function");
  });

  test("PRESET_FIELDS 导出且为非空数组", () => {
    expect(Array.isArray(PRESET_FIELDS)).toBe(true);
    expect(PRESET_FIELDS.length).toBeGreaterThan(0);
  });
});

describe("createParamsPayload.fromForm - 必发字段（永远不省）", () => {
  test("prompt / negative_prompt / size / steps / cfg 永远输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "  cat  ",
      negative_prompt: "ugly",
      size: 512,
      steps: 20,
      cfg: 7.0,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });
    expect(wire.prompt).toBe("cat"); // trim
    expect(wire.negative_prompt).toBe("ugly");
    expect(wire.size).toBe(512);
    expect(wire.steps).toBe(20);
    expect(wire.cfg).toBe(7.0);
  });

  test("prompt 前后空格被 trim", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "  hello world  ",
      negative_prompt: "",
      size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect(wire.prompt).toBe("hello world");
  });

  test("negative_prompt 空值保留为空字符串（不省）", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x",
      negative_prompt: "",
      size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("negative_prompt" in wire).toBe(true);
    expect(wire.negative_prompt).toBe("");
  });

  test("steps 防御性 parseInt", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "",
      size: 512, steps: "20", cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect(wire.steps).toBe(20);
  });

  test("cfg 防御性 parseFloat", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "",
      size: 512, steps: 1, cfg: "7.5",
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect(wire.cfg).toBe(7.5);
  });
});

describe("createParamsPayload.fromForm - omitIf 规则", () => {
  test("scheduler 空字符串 → 省略", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("scheduler" in wire).toBe(false);
  });

  test("scheduler 有值 → 输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "euler", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect(wire.scheduler).toBe("euler");
  });

  test("karras=false → 省略", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("karras" in wire).toBe(false);
  });

  test("karras=true → 输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: true, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect(wire.karras).toBe(true);
  });

  test("use_opencl=false → 省略", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("use_opencl" in wire).toBe(false);
  });

  test("use_opencl=true → 输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: true, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect(wire.use_opencl).toBe(true);
  });

  test("clip_skip=1 → 省略（不 >1）", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("clip_skip" in wire).toBe(false);
  });

  test("clip_skip=2 → 输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 2, seed: null, local_dream_url: "",
    });
    expect(wire.clip_skip).toBe(2);
  });

  test("clip_skip=1.5（非整数）→ 省略", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1.5, seed: null, local_dream_url: "",
    });
    expect("clip_skip" in wire).toBe(false);
  });

  test("seed=null（seedRandom checked）→ 省略", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("seed" in wire).toBe(false);
  });

  test("seed=42 → 输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: 42, local_dream_url: "",
    });
    expect(wire.seed).toBe(42);
  });

  test("local_dream_url 空字符串 → 省略", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
    });
    expect("local_dream_url" in wire).toBe(false);
  });

  test("local_dream_url='127.0.0.1:8081'（无 http）→ 加 http:// 前缀", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null,
      local_dream_url: "127.0.0.1:8081",
    });
    expect(wire.local_dream_url).toBe("http://127.0.0.1:8081");
  });

  test("local_dream_url='http://x:8081'（已有 http）→ 不重复加", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null,
      local_dream_url: "http://x:8081",
    });
    expect(wire.local_dream_url).toBe("http://x:8081");
  });

  test("local_dream_url='  127.0.0.1  '（前后空格）→ trim 后加 http", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null,
      local_dream_url: "  127.0.0.1  ",
    });
    expect(wire.local_dream_url).toBe("http://127.0.0.1");
  });
});

describe("createParamsPayload.fromForm - presetMode 白名单", () => {
  test("presetMode=true → 输出仅含 PRESET_FIELDS 白名单的字段", () => {
    const payload = createParamsPayload();
    const snap = {
      prompt: "cat",
      negative_prompt: "ugly",
      size: 512,
      steps: 20,
      cfg: 7.0,
      scheduler: "euler",
      karras: true,
      clip_skip: 2,
      denoise_strength: 0.5,
      mode: "img2img",
      // 不该进 preset
      seed: 42,
      use_opencl: true,
      local_dream_url: "http://x:8081",
    };
    const wire = payload.fromForm(snap, { presetMode: true });
    expect("seed" in wire).toBe(false);
    expect("use_opencl" in wire).toBe(false);
    expect("local_dream_url" in wire).toBe(false);
  });

  test("presetMode=true → 白名单字段被输出（即使本身会被默认 omitIf 省略）", () => {
    // 例如 scheduler 空字符串默认省，但 preset 仍要保留（preset 维度）
    const payload = createParamsPayload();
    const snap = {
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", // 默认会省
      karras: false, clip_skip: 1, // 默认会省
      denoise_strength: 0.5, mode: "txt2img",
      seed: null, use_opencl: false, local_dream_url: "",
    };
    const wire = payload.fromForm(snap, { presetMode: true });
    expect("scheduler" in wire).toBe(true);
    expect(wire.scheduler).toBe("");
    expect("karras" in wire).toBe(true);
    expect(wire.karras).toBe(false);
    expect("clip_skip" in wire).toBe(true);
    expect(wire.clip_skip).toBe(1);
  });

  test("presetMode=true → denoise_strength 和 mode 出现在输出", () => {
    const payload = createParamsPayload();
    const wire = payload.fromForm({
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "", karras: false, use_opencl: false, clip_skip: 1, seed: null, local_dream_url: "",
      denoise_strength: 0.75, mode: "img2img",
    }, { presetMode: true });
    expect(wire.denoise_strength).toBe(0.75);
    expect(wire.mode).toBe("img2img");
  });
});

describe("createParamsPayload - 纯函数性", () => {
  test("同输入 → 同输出（无 module-level mutable state）", () => {
    const payload = createParamsPayload();
    const snap = {
      prompt: "x", negative_prompt: "", size: 512, steps: 1, cfg: 1,
      scheduler: "euler", karras: true, use_opencl: true, clip_skip: 2, seed: 5,
      local_dream_url: "http://x:8081",
    };
    const a = payload.fromForm(snap);
    const b = payload.fromForm(snap);
    expect(a).toEqual(b);
  });
});

describe("createParamsPayload - 端到端", () => {
  test("Form.read() 风格的 snap → payload.fromForm() → 期望 wire", () => {
    const payload = createParamsPayload();
    // 模拟典型用户输入
    const wire = payload.fromForm({
      prompt: "  a cute cat  ",
      negative_prompt: "ugly, blurry",
      size: 768,
      steps: 30,
      cfg: 7.5,
      scheduler: "dpm++2m",
      karras: true,
      use_opencl: false,
      clip_skip: 2,
      seed: 12345,
      local_dream_url: "127.0.0.1:8081",
    });
    expect(wire).toEqual({
      prompt: "a cute cat",
      negative_prompt: "ugly, blurry",
      size: 768,
      steps: 30,
      cfg: 7.5,
      scheduler: "dpm++2m",
      karras: true,
      clip_skip: 2,
      seed: 12345,
      local_dream_url: "http://127.0.0.1:8081",
    });
    // use_opencl=false → 不出现在 wire
    expect("use_opencl" in wire).toBe(false);
  });
});

describe("redactBinaries", () => {
  test("把 image 键（值存在）替换为 '(base64 omitted)'", () => {
    const out = redactBinaries({ prompt: "x", image: "iVBOR..." });
    expect(out).toContain('"image": "(base64 omitted)"');
    expect(out).toContain('"prompt": "x"');
  });

  test("把 mask 键（值存在）替换为 '(base64 omitted)'", () => {
    const out = redactBinaries({ mask: "AAAA" });
    expect(out).toContain('"mask": "(base64 omitted)"');
  });

  test("image 值为 null 时替换为 '(base64 omitted)'（与 undefined 区别：null 是显式占位）", () => {
    const out = redactBinaries({ image: null });
    expect(out).toContain('"image": "(base64 omitted)"');
  });

  test("image 值为空字符串时替换为 '(base64 omitted)'", () => {
    const out = redactBinaries({ image: "" });
    expect(out).toContain('"image": "(base64 omitted)"');
  });

  test("image 键不存在时不出现在输出中（JSON.stringify 跳过 undefined）", () => {
    const out = redactBinaries({ prompt: "x" });
    expect(out).not.toContain("image");
  });

  test("不影响其他字段", () => {
    const out = redactBinaries({ prompt: "x", size: 512, image: "abc" });
    expect(out).toContain('"prompt": "x"');
    expect(out).toContain('"size": 512');
  });
});
