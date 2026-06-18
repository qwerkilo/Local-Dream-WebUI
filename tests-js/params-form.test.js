// params.js → createParamsForm 单元测试（bun:test）
//
// 覆盖：
// - read：11 个字段全部返回（snake_case，image/mask 不出现）
// - size 控件：custom 路径走 sizeCustom，preset 路径走 select，永远返回整数
// - seed：seedRandom.checked=true → null；未勾选 → 整数值
// - apply：写全部 11 个控件 + size 必派 change 事件
// - apply：textarea/checkbox 派 input 事件
// - bind：slider input → 显示标签联动（通用，不写死 id）
// - bind：size change → sizeCustom 可见性
// - bind：seedRandom change → seed 可见性
// - bind：textarea input → auto-resize 高度
//
// 运行：`bun test tests-js/params-form.test.js` 或 `bun test`

import { describe, test, expect, beforeEach } from "bun:test";
import { createParamsForm } from "../static/params.js";

// 构造一个完整的 mocks 字典：每个控件 id 都有 value/checked + addEventListener + dispatchEvent
// 模拟 DOM 元素的最常用属性，让工厂函数不报错。
function makeMocks(overrides = {}) {
  const base = {
    prompt: {
      value: "",
      addEventListener: () => {},
      dispatchEvent: () => {},
      style: {},
      scrollHeight: 0,
    },
    negPrompt: {
      value: "",
      addEventListener: () => {},
      dispatchEvent: () => {},
      style: {},
      scrollHeight: 0,
    },
    size: { value: "512", addEventListener: () => {}, dispatchEvent: () => {} },
    sizeCustom: {
      value: "448",
      addEventListener: () => {},
      dispatchEvent: () => {},
      classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    },
    steps: { value: "20", addEventListener: () => {}, dispatchEvent: () => {} },
    cfg: { value: "7.0", addEventListener: () => {}, dispatchEvent: () => {} },
    scheduler: { value: "", addEventListener: () => {}, dispatchEvent: () => {} },
    karras: { value: false, checked: false, addEventListener: () => {}, dispatchEvent: () => {} },
    useOpenCL: {
      value: false,
      checked: false,
      addEventListener: () => {},
      dispatchEvent: () => {},
    },
    clipSkip: { value: "1", addEventListener: () => {}, dispatchEvent: () => {} },
    seed: {
      value: "10",
      addEventListener: () => {},
      dispatchEvent: () => {},
      classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    },
    seedRandom: { value: true, checked: true, addEventListener: () => {}, dispatchEvent: () => {} },
    ldUrl: { value: "", addEventListener: () => {}, dispatchEvent: () => {} },
    aspectRatio: { value: "none", addEventListener: () => {}, dispatchEvent: () => {} },
    outputFormat: { value: "", addEventListener: () => {}, dispatchEvent: () => {} },
    previewFormat: { value: "", addEventListener: () => {}, dispatchEvent: () => {} },
    showDiffusionStride: { value: "1", addEventListener: () => {}, dispatchEvent: () => {} },
    // 联动显示标签
    stepsVal: { textContent: "", addEventListener: () => {}, dispatchEvent: () => {} },
    cfgVal: { textContent: "", addEventListener: () => {}, dispatchEvent: () => {} },
    denoiseVal: { textContent: "", addEventListener: () => {}, dispatchEvent: () => {} },
    brushVal: { textContent: "", addEventListener: () => {}, dispatchEvent: () => {} },
  };
  return { ...base, ...overrides };
}

describe("createParamsForm - read", () => {
  test("返回 15 个键（snake_case, 包含空值/默认值，不省略）", () => {
    const mocks = makeMocks();
    const $ = (id) => mocks[id];
    const form = createParamsForm({ $ });

    const snap = form.read();
    expect(Object.keys(snap).sort()).toEqual([
      "aspect_ratio",
      "cfg",
      "clip_skip",
      "karras",
      "local_dream_url",
      "negative_prompt",
      "output_format",
      "preview_format",
      "prompt",
      "scheduler",
      "seed",
      "show_diffusion_stride",
      "size",
      "steps",
      "use_opencl",
    ]);
  });

  test("image / mask 键永远不出现", () => {
    const mocks = makeMocks();
    const form = createParamsForm({ $: (id) => mocks[id] });

    const snap = form.read();
    expect("image" in snap).toBe(false);
    expect("mask" in snap).toBe(false);
  });

  test("size: select 走 preset（512）→ 整数 512", () => {
    const mocks = makeMocks({
      size: { value: "512", addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(form.read().size).toBe(512);
  });

  test("size: custom 路径走 sizeCustom → 整数 448", () => {
    const mocks = makeMocks({
      size: { value: "custom", addEventListener: () => {}, dispatchEvent: () => {} },
      sizeCustom: { value: "448", addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(form.read().size).toBe(448);
  });

  test("size: custom 但 sizeCustom 为空字符串 → parseInt 返 NaN（透传，调用方负责校验）", () => {
    const mocks = makeMocks({
      size: { value: "custom", addEventListener: () => {}, dispatchEvent: () => {} },
      sizeCustom: { value: "", addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(Number.isNaN(form.read().size)).toBe(true);
  });

  test("seed: seedRandom.checked=true → null", () => {
    const mocks = makeMocks({
      seedRandom: { checked: true, addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(form.read().seed).toBeNull();
  });

  test("seed: seedRandom.checked=false → 整数值", () => {
    const mocks = makeMocks({
      seedRandom: { checked: false, addEventListener: () => {}, dispatchEvent: () => {} },
      seed: { value: "42", addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(form.read().seed).toBe(42);
  });

  // 问题 #5：seed read 在 seedRandom unchecked + 空字符串输入时应返 null，
  // 不能让 NaN 漏到 wire payload（omitIf 不拦 NaN）。
  test("seed read: 空字符串 + seedRandom unchecked → null（不是 NaN）", () => {
    const mocks = makeMocks({
      seedRandom: { checked: false, addEventListener: () => {}, dispatchEvent: () => {} },
      seed: { value: "", addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(form.read().seed).toBeNull();
  });

  test("checkbox 字段 (karras/use_opencl) read 返 boolean", () => {
    const mocks = makeMocks({
      karras: { checked: true, addEventListener: () => {}, dispatchEvent: () => {} },
      useOpenCL: { checked: false, addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    const snap = form.read();
    expect(snap.karras).toBe(true);
    expect(snap.use_opencl).toBe(false);
  });

  test("textarea 字段 (prompt/negative_prompt) read 返原始字符串", () => {
    const mocks = makeMocks({
      prompt: {
        value: "  hello  ",
        addEventListener: () => {},
        dispatchEvent: () => {},
        style: {},
        scrollHeight: 0,
      },
      negPrompt: {
        value: "ugly",
        addEventListener: () => {},
        dispatchEvent: () => {},
        style: {},
        scrollHeight: 0,
      },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    const snap = form.read();
    // read 不做 trim（那是 payload 层的职责），只透传
    expect(snap.prompt).toBe("  hello  ");
    expect(snap.negative_prompt).toBe("ugly");
  });

  test("local_dream_url read 透传字符串（不加 http）", () => {
    const mocks = makeMocks({
      ldUrl: { value: "127.0.0.1:8081", addEventListener: () => {}, dispatchEvent: () => {} },
    });
    const form = createParamsForm({ $: (id) => mocks[id] });

    expect(form.read().local_dream_url).toBe("127.0.0.1:8081");
  });
});

describe("createParamsForm - apply", () => {
  test("写全部 15 个控件值", () => {
    const mocks = makeMocks();
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.apply({
      prompt: "a cat",
      negative_prompt: "ugly",
      size: 640,
      steps: 30,
      cfg: 9.5,
      scheduler: "euler",
      karras: true,
      use_opencl: true,
      clip_skip: 2,
      seed: 123,
      local_dream_url: "http://localhost:8081",
      aspect_ratio: "16:9",
      output_format: "jpeg",
      preview_format: "jpeg",
      show_diffusion_stride: 2,
    });

    expect(mocks.prompt.value).toBe("a cat");
    expect(mocks.negPrompt.value).toBe("ugly");
    expect(mocks.size.value).toBe("640");
    expect(mocks.steps.value).toBe("30");
    expect(mocks.cfg.value).toBe("9.5");
    expect(mocks.scheduler.value).toBe("euler");
    expect(mocks.karras.checked).toBe(true);
    expect(mocks.useOpenCL.checked).toBe(true);
    expect(mocks.clipSkip.value).toBe("2");
    expect(mocks.seed.value).toBe("123");
    expect(mocks.ldUrl.value).toBe("http://localhost:8081");
    expect(mocks.aspectRatio.value).toBe("16:9");
    expect(mocks.outputFormat.value).toBe("jpeg");
    expect(mocks.previewFormat.value).toBe("jpeg");
    expect(mocks.showDiffusionStride.value).toBe("2");
  });

  test("size=512 (preset) → size.value=512 不动 sizeCustom", () => {
    const mocks = makeMocks();
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.apply({
      size: 512,
      prompt: "",
      negative_prompt: "",
      steps: 1,
      cfg: 1,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });

    expect(mocks.size.value).toBe("512");
    expect(mocks.sizeCustom.value).toBe("448"); // 未变
  });

  test("size=448 (custom) → size.value='custom' + sizeCustom.value='448'", () => {
    const mocks = makeMocks();
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.apply({
      size: 448,
      prompt: "",
      negative_prompt: "",
      steps: 1,
      cfg: 1,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });

    expect(mocks.size.value).toBe("custom");
    expect(mocks.sizeCustom.value).toBe("448");
  });

  test("apply 后 size 控件必派 change 事件（让 sizeCustom 联动可见性）", () => {
    const dispatches = [];
    const mocks = makeMocks();
    mocks.size.dispatchEvent = (ev) => dispatches.push(ev.type);
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.apply({
      size: 448,
      prompt: "",
      negative_prompt: "",
      steps: 1,
      cfg: 1,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });

    expect(dispatches).toContain("change");
  });

  test("apply 后 textarea 派 input 事件（触发 auto-resize）", () => {
    const dispatches = [];
    const mocks = makeMocks();
    mocks.prompt.dispatchEvent = (ev) => dispatches.push(["prompt", ev.type]);
    mocks.negPrompt.dispatchEvent = (ev) => dispatches.push(["negPrompt", ev.type]);
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.apply({
      size: 512,
      prompt: "x",
      negative_prompt: "y",
      steps: 1,
      cfg: 1,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });

    expect(dispatches).toContainEqual(["prompt", "input"]);
    expect(dispatches).toContainEqual(["negPrompt", "input"]);
  });

  test("apply 后 select 控件派 change 事件（scheduler）", () => {
    const dispatches = [];
    const mocks = makeMocks();
    mocks.scheduler.dispatchEvent = (ev) => dispatches.push(ev.type);
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.apply({
      size: 512,
      prompt: "",
      negative_prompt: "",
      steps: 1,
      cfg: 1,
      scheduler: "euler",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });

    expect(dispatches).toContain("change");
  });

  // 问题 #2：apply 写 seed 字段时，seedRandom 控件必须收到 change 事件，
  // 这样 bind() 装的"seedRandom change → seed 可见性"监听器会触发联动。
  test("apply seed 字段时,seedRandom 控件收到 change 事件（可见性切换联动）", () => {
    const dispatches = [];
    const mocks = makeMocks();
    mocks.seedRandom.dispatchEvent = (ev) => dispatches.push(ev.type);
    const form = createParamsForm({ $: (id) => mocks[id] });

    // 模拟从 null 切到具体数值（或反向）：apply 写 seed 后
    // 应触发 seedRandom 的 change 事件，bind 阶段装的监听器据此切可见性。
    form.apply({
      size: 512,
      prompt: "",
      negative_prompt: "",
      steps: 1,
      cfg: 1,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: 42,
      local_dream_url: "",
    });

    expect(dispatches).toContain("change");
  });

  test("apply 时省略字段不写（不破坏 undefined 漏入 DOM）", () => {
    const mocks = makeMocks();
    const form = createParamsForm({ $: (id) => mocks[id] });

    // size 故意省略（undefined）
    form.apply({
      prompt: "x",
      negative_prompt: "y",
      steps: 1,
      cfg: 1,
      scheduler: "",
      karras: false,
      use_opencl: false,
      clip_skip: 1,
      seed: null,
      local_dream_url: "",
    });

    // size.value 保持原值不变
    expect(mocks.size.value).toBe("512");
  });
});

describe("createParamsForm - bind", () => {
  test("bind: 装 size change → sizeCustom 可见性切换监听器", () => {
    const listeners = [];
    const mocks = makeMocks();
    mocks.size.addEventListener = (ev, fn) => listeners.push(["size", ev, fn]);
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.bind();

    // 找到 size 的 change 监听器
    const sizeChange = listeners.find(([id, ev]) => id === "size" && ev === "change");
    expect(sizeChange).toBeDefined();

    // 执行 change 监听器 → 触发 sizeCustom.classList.toggle('collapsed', size.value !== 'custom')
    let toggled = null;
    mocks.sizeCustom.classList.toggle = (cls, force) => {
      toggled = [cls, force];
    };
    mocks.size.value = "custom";
    sizeChange[2](); // 调监听器
    expect(toggled).toEqual(["collapsed", false]);

    mocks.size.value = "512";
    sizeChange[2]();
    expect(toggled).toEqual(["collapsed", true]);
  });

  test("bind: 装 seedRandom change → seed 可见性切换监听器", () => {
    const listeners = [];
    const mocks = makeMocks();
    mocks.seedRandom.addEventListener = (ev, fn) => listeners.push(["seedRandom", ev, fn]);
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.bind();

    const seedRandomChange = listeners.find(([id, ev]) => id === "seedRandom" && ev === "change");
    expect(seedRandomChange).toBeDefined();

    let toggled = null;
    mocks.seed.classList.toggle = (cls, force) => {
      toggled = [cls, force];
    };
    mocks.seedRandom.checked = true;
    seedRandomChange[2]();
    expect(toggled).toEqual(["hidden", true]);

    mocks.seedRandom.checked = false;
    seedRandomChange[2]();
    expect(toggled).toEqual(["hidden", false]);
  });

  test("bind: 装 slider input → 显示标签联动（通用逻辑）", () => {
    const listeners = [];
    const mocks = makeMocks();
    // 捕获所有 addEventListener 调用
    for (const id of Object.keys(mocks)) {
      const orig = mocks[id].addEventListener;
      mocks[id].addEventListener = (ev, fn) => {
        listeners.push([id, ev, fn]);
        return orig.call(mocks[id], ev, fn);
      };
    }
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.bind();

    // 找到 steps input 监听器
    const stepsInput = listeners.find(([id, ev]) => id === "steps" && ev === "input");
    expect(stepsInput).toBeDefined();

    mocks.steps.value = "30";
    stepsInput[2](); // 调监听器
    expect(mocks.stepsVal.textContent).toBe("30");
  });

  test("bind: 装 textarea input → auto-resize（不依赖 id 写死）", () => {
    const listeners = [];
    const mocks = makeMocks();
    for (const id of Object.keys(mocks)) {
      const orig = mocks[id].addEventListener;
      mocks[id].addEventListener = (ev, fn) => {
        listeners.push([id, ev, fn]);
        return orig.call(mocks[id], ev, fn);
      };
    }
    const form = createParamsForm({ $: (id) => mocks[id] });

    form.bind();

    // 找到 prompt input 监听器
    const promptInput = listeners.find(([id, ev]) => id === "prompt" && ev === "input");
    expect(promptInput).toBeDefined();

    mocks.prompt.scrollHeight = 100;
    promptInput[2]();
    expect(mocks.prompt.style.height).toBe("100px");
  });
});
