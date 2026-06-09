// 前端 ParamsForm + ParamsPayload 模块。
//
// 本模块是 templates/index.html 表单 ↔ /generate wire payload 的接缝：
// - createParamsForm：DOM 控件 ↔ 字段值的双向接缝（read / apply / bind），不掺业务规则。
//   字段表形状：name → { id, read, write }。11 个键（snake_case 输出）：
//   prompt / negative_prompt / size / steps / cfg / scheduler /
//   karras / use_opencl / clip_skip / seed / local_dream_url。
//   image / mask **不在** ParamsForm（那是图像状态，后续候选）。
// - createParamsPayload：纯函数工厂，输入 raw snap（来自 form.read()），
//   输出 wire object（snake_case，省略空值/默认值）。默认 rules 内置在模块顶部。
//   presetMode: true 时仅输出 PRESET_FIELDS 白名单字段。
// - redactBinaries：调试 JSON redaction 辅助函数，独立于 fromForm。
//
// 在浏览器中通过 <script type="module" src="static/params.js"> 加载；
// 在 bun:test 中通过 ES module 导入。

// size 下拉允许的预设值（数字字符串）。不在内走 "custom" 路径。
const ALLOWED_SIZES = [256, 384, 512, 640, 768, 1024];

// preset 模式下要保留的字段白名单。
// 注意：mode / denoise_strength 进 preset（保存"txt2img vs img2img"和强度偏好）；
// seed / use_opencl / local_dream_url 不进 preset（Q20 + 当前行为锁定）。
export const PRESET_FIELDS = [
  "prompt",
  "negative_prompt",
  "size",
  "steps",
  "cfg",
  "scheduler",
  "karras",
  "clip_skip",
  "denoise_strength",
  "mode",
];

// 默认字段规则：每字段 { omitIf, postProcess }。
// omitIf(v) 返 true → 字段从输出中省略。
// postProcess(v) → 输出值（透传 / 转换）。
//
// 注意：seed 在 ParamsForm.read() 中当 seedRandom.checked=true 时返 null，
// 由 omitIf 处理；不需要 read 侧的特判。
const DEFAULT_RULES = {
  prompt: {
    omitIf: () => false,
    postProcess: (v) => (v || "").trim(),
  },
  negative_prompt: {
    omitIf: () => false,
    postProcess: (v) => v || "",
  },
  size: {
    omitIf: () => false,
    postProcess: (v) => v,
  },
  steps: {
    omitIf: () => false,
    postProcess: (v) => parseInt(v),
  },
  cfg: {
    omitIf: () => false,
    postProcess: (v) => parseFloat(v),
  },
  scheduler: {
    omitIf: (v) => !v,
    postProcess: (v) => v,
  },
  karras: {
    omitIf: (v) => v !== true,
    postProcess: (v) => v,
  },
  use_opencl: {
    omitIf: (v) => v !== true,
    postProcess: (v) => v,
  },
  clip_skip: {
    omitIf: (v) => !(Number.isInteger(v) && v > 1),
    postProcess: (v) => v,
  },
  seed: {
    omitIf: (v) => v == null,
    postProcess: (v) => v,
  },
  // denoise_strength / mode 仅在 presetMode 路径走 rule（默认模式不输出这两个字段）。
  // preset 里需要保"txt2img vs img2img"和强度偏好；给它们补 rule 后，
  // 兜底分支 `out[key] = snap[key]` 不会再发生，类型也由 postProcess 规整。
  denoise_strength: {
    omitIf: () => false,
    postProcess: (v) => parseFloat(v),
  },
  mode: {
    omitIf: () => false,
    postProcess: (v) => String(v),
  },
  local_dream_url: {
    omitIf: (v) => !v || !String(v).trim(),
    postProcess: (v) => {
      const s = String(v).trim();
      return s.startsWith("http") ? s : "http://" + s;
    },
  },
};

// local_dream_url 默认走 omitIf：ldToggle 未勾时 raw snap 的 local_dream_url
// 仍可能是空字符串，由 rule 决定是否省略。callers 也可以在 fromForm 前剔除。

// createParamsForm({ $ })
//   $  : (id: string) => HTMLElement  ——  控件查询函数
// 返回 { read(), apply(snap), bind() }。
export function createParamsForm({ $ }) {
  if (typeof $ !== "function") {
    throw new TypeError("createParamsForm: $ must be a function");
  }

  // 字段表：snake_case 输出键 → { id, read, write }。
  // size 是最特殊的：custom 路径走 sizeCustom，永远吐整数。
  const fields = {
    prompt: {
      id: "prompt",
      read: () => $("prompt").value,
      write: (v) => { $("prompt").value = v == null ? "" : String(v); },
    },
    negative_prompt: {
      id: "negPrompt",
      read: () => $("negPrompt").value,
      write: (v) => { $("negPrompt").value = v == null ? "" : String(v); },
    },
    size: {
      id: "size",
      read: () => {
        const sel = $("size");
        if (sel.value === "custom") return parseInt($("sizeCustom").value);
        return parseInt(sel.value);
      },
      write: (v) => {
        if (ALLOWED_SIZES.includes(v)) {
          $("size").value = String(v);
        } else {
          $("size").value = "custom";
          $("sizeCustom").value = String(v);
        }
        // 联动（sizeCustom 可见性）由 apply 公共循环派 change 触发（APPLY_EVENT_TYPE.size === "change"）
      },
    },
    steps: {
      id: "steps",
      read: () => $("steps").value,
      write: (v) => { $("steps").value = String(v); },
    },
    cfg: {
      id: "cfg",
      read: () => $("cfg").value,
      write: (v) => { $("cfg").value = String(v); },
    },
    scheduler: {
      id: "scheduler",
      read: () => $("scheduler").value,
      write: (v) => { $("scheduler").value = v == null ? "" : String(v); },
    },
    karras: {
      id: "karras",
      read: () => $("karras").checked === true,
      write: (v) => { $("karras").checked = v === true; },
    },
    use_opencl: {
      id: "useOpenCL",
      read: () => $("useOpenCL").checked === true,
      write: (v) => { $("useOpenCL").checked = v === true; },
    },
    clip_skip: {
      id: "clipSkip",
      read: () => $("clipSkip").value,
      write: (v) => { $("clipSkip").value = String(v); },
    },
    seed: {
      id: "seed",
      // seedRandom.checked → null（不固定种子）；否则读 seed 值。
      // 空字符串 → NaN，必须归一化为 null，让 omitIf 能正确省略
      // （NaN == null 是 false，会漏过 omitIf 把 NaN 送进 wire）。
      read: () => {
        if ($("seedRandom").checked) return null;
        const n = parseInt($("seed").value);
        return Number.isNaN(n) ? null : n;
      },
      write: (v) => {
        $("seedRandom").checked = v == null;
        if (v != null) $("seed").value = String(v);
        // 联动：seedRandom change 触发 bind() 装的"seed 可见性切换"监听器。
        // apply 公共循环对 seed 字段派的是 input 到 #seed 控件，
        // 不会触发 seedRandom 的 change，所以这里显式补一发。
        $("seedRandom").dispatchEvent(new Event("change"));
      },
    },
    local_dream_url: {
      id: "ldUrl",
      read: () => $("ldUrl").value,
      write: (v) => { $("ldUrl").value = v == null ? "" : String(v); },
    },
  };

  // 控件 → 事件类型映射（用于 apply 后的联动 dispatch）。
  // 键是字段 f.id：size / scheduler / ldUrl 是 <select> 派 change；
  // 其他字段（textarea/checkbox/input）默认派 input。
  // seed 字段不在这张表里：它的 write 内部已显式派 change 给 seedRandom 控件
  // （让 bind 装的"seed 可见性切换"联动触发），避免污染这张表。
  const APPLY_EVENT_TYPE = {
    size: "change",
    scheduler: "change",
    ldUrl: "change",
  };

  return {
    // 读取所有 11 个字段的当前值。空值/默认值不省略。
    read() {
      const out = {};
      for (const [key, f] of Object.entries(fields)) {
        out[key] = f.read();
      }
      return out;
    },

    // 把 snap 写到所有 11 个控件。按控件类型 dispatch 联动事件。
    // size 必派 change（因为有 select + sizeCustom 两层联动）；
    // 其他 select 派 change，checkbox/input 派 input，textarea 派 input。
    apply(snap) {
      if (!snap || typeof snap !== "object") return;
      for (const [key, f] of Object.entries(fields)) {
        if (!(key in snap)) continue; // 显式省略的字段不写
        f.write(snap[key]);
      }
      // 派联动事件：textarea/checkbox/input 派 input；select 派 change
      for (const [key, f] of Object.entries(fields)) {
        if (!(key in snap)) continue;
        const el = $(f.id);
        if (!el || typeof el.dispatchEvent !== "function") continue;
        const evt = APPLY_EVENT_TYPE[f.id] || "input";
        el.dispatchEvent(new Event(evt));
      }
    },

    // 启动时一次性装联动事件。设计原则：通用逻辑，不写死 id。
    // - slider (steps/cfg/denoise/brushSize) input → 显示标签联动
    // - size change → sizeCustom 可见性切换
    // - seedRandom change → seed 可见性切换
    // - textarea input → auto-resize
    bind() {
      // slider → 显示标签联动。通用：对每对 (sliderId, valId) 装 input 监听。
      // 这里保留 4 对以保持与 index.html 行为一致（steps/cfg/denoise/brushSize）。
      const sliderPairs = [
        ["steps", "stepsVal"],
        ["cfg", "cfgVal"],
        ["denoise", "denoiseVal"],
        ["brushSize", "brushVal"],
      ];
      for (const [sliderId, valId] of sliderPairs) {
        const el = $(sliderId);
        const vEl = $(valId);
        if (!el || !vEl) continue;
        el.addEventListener("input", () => { vEl.textContent = el.value; });
      }

      // size change → sizeCustom 可见性
      const size = $("size");
      const sizeCustom = $("sizeCustom");
      if (size && sizeCustom) {
        size.addEventListener("change", () => {
          sizeCustom.classList.toggle("collapsed", size.value !== "custom");
        });
      }

      // seedRandom change → seed 可见性
      const seedRandom = $("seedRandom");
      const seed = $("seed");
      if (seedRandom && seed) {
        seedRandom.addEventListener("change", () => {
          seed.classList.toggle("hidden", seedRandom.checked);
        });
      }

      // textarea input → auto-resize（通用：对所有 textarea 装 input 监听）
      // 由调用方保证 DOM 中只有 prompt / negPrompt 两个 textarea。
      const textareas = ["prompt", "negPrompt"];
      for (const id of textareas) {
        const ta = $(id);
        if (!ta) continue;
        const resize = () => {
          ta.style.height = "auto";
          ta.style.height = ta.scrollHeight + "px";
        };
        ta.addEventListener("input", resize);
        // 不在这里主动调用 resize()（apply 时会通过 dispatch input 触发）
      }
    },
  };
}

// createParamsPayload({ rules? })
//   rules : 可选字段规则覆盖；未传 → 用 DEFAULT_RULES。
// 返回 { fromForm(snap, options?) }。fromForm 是纯函数（同输入同输出）。
export function createParamsPayload({ rules } = {}) {
  const r = rules || DEFAULT_RULES;

  return {
    // snap : ParamsForm.read() 风格的 11 键对象（snake_case）
    // options.presetMode : true → 仅输出 PRESET_FIELDS 白名单字段
    // 返回 wire object（snake_case，省略空值/默认值）。
    fromForm(snap, options = {}) {
      if (!snap || typeof snap !== "object") return {};
      const out = {};
      const { presetMode = false } = options;

      if (presetMode) {
        // preset 模式：仅遍历白名单，每个字段即使会被默认 omitIf 省略也强制输出
        for (const key of PRESET_FIELDS) {
          if (!(key in snap)) continue;
          const rule = r[key];
          if (!rule) {
            out[key] = snap[key];
            continue;
          }
          out[key] = rule.postProcess(snap[key]);
        }
        return out;
      }

      // 默认模式：遍历 DEFAULT_RULES 中所有字段，按 omitIf 决定是否输出
      for (const [key, rule] of Object.entries(r)) {
        if (!(key in snap)) continue;
        const v = snap[key];
        if (rule.omitIf(v)) continue;
        out[key] = rule.postProcess(v);
      }
      return out;
    },
  };
}

// redactBinaries(obj)
// 把 obj 中 image / mask 键（值存在时）替换为字符串 "(base64 omitted)"，
// 返回 JSON.stringify(obj, replacer, 2) 的字符串。
// 独立的 redaction 辅助函数，不污染 ParamsPayload.fromForm。
export function redactBinaries(obj) {
  const SENSITIVE = new Set(["image", "mask"]);
  const replacer = (key, value) => {
    // value === undefined 表示键不存在（JSON.stringify 会跳过它）。
    // null 和 空字符串 都视为"有值"——空字符串是 mask 字段被显式清空时可能的状态。
    if (SENSITIVE.has(key) && value !== undefined) return "(base64 omitted)";
    return value;
  };
  return JSON.stringify(obj, replacer, 2);
}
