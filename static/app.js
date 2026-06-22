// 从 static/params.js 导入参数表单与 payload 工厂。
// ParamsForm：DOM 控件 ↔ 字段值接缝（read/apply/bind）。
// ParamsPayload：纯函数工厂，把 raw snap 规整为 wire object（snake_case，省略空值/默认值）。
// redactBinaries：调试 JSON redaction 辅助（image / mask 字段替换为 "(base64 omitted)"）。
import { createParamsForm, createParamsPayload, redactBinaries } from "/static/params.js";

const $ = (id) => document.getElementById(id);
// === ICON SYSTEM (inline SVG, Lucide-style 1.75 stroke) ===
const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off":
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  "alert-triangle":
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};
function renderIcon(target, name) {
  const path = ICON_PATHS[name];
  if (!target || !path) return;
  target.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" xmlns="' +
    SVG_NS +
    '" aria-hidden="true">' +
    path +
    "</svg>";
}

// === MODAL HELPERS (Esc + focus management) ===
function openModal(modal, opener) {
  if (!modal) return;
  modal._opener = opener || document.activeElement;
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  const first = modal.querySelector(
    ".modal-toolbar button, .modal-toolbar input, .modal-body input",
  );
  if (first) first.focus();
}
function closeModal(modal) {
  if (!modal) return;
  modal.classList.add("hidden");
  if (!document.querySelector(".modal:not(.hidden)")) document.body.style.overflow = "";
  if (modal._opener && typeof modal._opener.focus === "function") modal._opener.focus();
  modal._opener = null;
}
["cropModal", "maskModal", "automaskModal", "promptModal"].forEach((id) => {
  const m = $(id);
  if (!m) return;
  m.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal(m);
  });
});

// === PROMPT MODAL (replaces native prompt()/confirm()) ===
function openPromptModal(opts) {
  return new Promise((resolve) => {
    const { title, body, defaultValue, confirmLabel, danger } = opts;
    $("promptModalTitle").textContent = title;
    $("promptConfirm").textContent = confirmLabel || t("prompt_modal_confirm");
    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }
    if (defaultValue != null) {
      $("promptBody").innerHTML =
        '<input type="text" id="promptModalInput" value="' + escapeHtml(defaultValue) + '">';
    } else {
      $("promptBody").textContent = "";
      const p = document.createElement("p");
      if (danger) p.className = "danger-text";
      p.textContent = body || "";
      $("promptBody").appendChild(p);
    }
    const confirm = $("promptConfirm");
    const cancel = $("promptCancel");
    const cleanup = () => {
      confirm.removeEventListener("click", onConfirm);
      cancel.removeEventListener("click", onCancel);
    };
    const onConfirm = () => {
      const v = defaultValue != null ? $("promptModalInput").value.trim() || null : true;
      cleanup();
      closeModal($("promptModal"));
      resolve(v);
    };
    const onCancel = () => {
      cleanup();
      closeModal($("promptModal"));
      resolve(null);
    };
    confirm.addEventListener("click", onConfirm);
    cancel.addEventListener("click", onCancel);
    openModal($("promptModal"), document.activeElement);
    if (defaultValue != null) {
      const inp = $("promptModalInput");
      inp.focus();
      inp.select();
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") onConfirm();
      });
    }
  });
}

const i18n = { en: {}, zh: {} };
let currLang = localStorage.getItem("lang") || "en";

function t(key) {
  return i18n[currLang][key] ?? i18n.en[key] ?? key;
}

i18n.en = {
  tab_txt2img: "txt2img",
  tab_img2img: "img2img",
  tab_upscale: "Upscale",
  label_prompt: "Prompt",
  label_neg_prompt: "Negative Prompt",
  label_input_image: "Input image",
  label_denoise: "Denoise strength",
  label_hf_token: "HF Token",
  label_hf_token_hint: "— required for Automask",
  hf_token_placeholder: "hf_…",
  upload_tap: "Tap to upload image",
  upload_change: "Tap to change image",
  mask_enable: "Enable mask (inpaint)",
  mask_edit: "Edit Mask",
  automask: "Automask",
  label_size: "Size",
  label_scheduler: "Scheduler",
  scheduler_default: "Default",
  label_steps: "Steps",
  label_cfg: "CFG scale",
  label_seed: "Seed",
  seed_random: "Random",
  label_clip_skip: "Clip skip",
  karras: "Karras sigmas",
  use_opencl: "Use OpenCL (Enables GPU for CPU Models)",
  generate: "Generate",
  show_json: "Show JSON",
  hide_json: "Hide JSON",
  download: "Download",
  details_title: "Details",
  label_time: "Time",
  label_mode: "Mode",
  label_denoise_short: "Denoise",
  progress_starting: "Starting…",
  progress_done: "Done!",
  progress_step: "Step",
  status_reachable: "Local Dream is reachable.",
  status_unreachable: "Local Dream not reachable — start the app and load a model first.",
  error_no_prompt: "Please enter a prompt.",
  error_no_image: "Please upload an input image.",
  error_stream: "Stream error",
  error_fetch: "Fetch error",
  error_connect: "Cannot connect to Local Dream. Is it running?",
  error_automask: "Automask failed",
  crop_title: "Position Image",
  crop_fit: "Fit",
  crop_fill: "Fill",
  crop_center: "Center",
  crop_cancel: "Cancel",
  crop_confirm: "Confirm",
  crop_hint: "Drag to reposition · Pinch to zoom · Empty areas will be outpainted",
  mask_title: "Draw Mask",
  mask_clear: "Clear",
  mask_undo: "Undo",
  mask_invert: "Invert",
  mask_brush: "Brush",
  mask_cancel: "Cancel",
  mask_done: "Done",
  mask_hint: "White = repaint · Black = keep · Draw with finger or stylus",
  automask_title: "Segments",
  automask_segmenting: "Segmenting…",
  automask_pad: "Pad",
  automask_cancel: "Cancel",
  automask_apply: "Apply Mask",
  custom_size_placeholder: "e.g. 448",
  adjust_crop: "Adjust crop",
  ld_url_placeholder: "http://127.0.0.1:8081",
  ld_status_default: "Default",
  ld_status_custom: "Custom",
  preset_title: "Settings",
  preset_default: "Default",
  preset_save: "Save",
  preset_delete: "Delete",
  preset_name_prompt: "Preset name",
  preset_confirm_delete: "Delete this preset?",
  preset_modal_save_title: "保存预设",
  preset_modal_delete_title: "删除预设",
  preset_modal_delete_body: "删除此预设？",
  label_aspect_ratio: "Aspect Ratio",
  aspect_none: "None",
  label_output_format: "Output Format",
  output_format_default: "Default (raw)",
  label_preview_format: "Preview Format",
  preview_format_raw: "Raw",
  label_diffusion_stride: "Preview Stride",
  advanced_options: "Advanced",
  label_gen_time: "Gen Time",
  label_first_step: "First Step",
  label_upscaler_model: "Upscaler Model",
  upscale: "Upscale ×4",
  upscaling: "Upscaling…",
  error_upscaler_path: "Select an upscaler model in Advanced settings first.",
  error_upscale: "Upscale failed",
  upscale_time: "Upscaled in",
  send_to_img2img: "Use in img2img",
  download_full: "Download Full",
  tap_to_upload: "Tap to upload image",
  theme_label_apple: "Apple",
  theme_label_original: "Original",
  theme_toggle_title: "切换主题",
  lang_toggle_title: "切换语言",
  hf_token_show: "显示令牌",
  hf_token_hide: "隐藏令牌",
  prompt_modal_title: "确认",
  prompt_modal_confirm: "确认",
  prompt_modal_cancel: "取消",
};

i18n.zh = {
  tab_txt2img: "文生图",
  tab_img2img: "图生图",
  tab_upscale: "放大",
  label_prompt: "提示词",
  label_neg_prompt: "负面提示词",
  label_input_image: "输入图片",
  label_denoise: "去噪强度",
  label_hf_token: "HF 令牌",
  label_hf_token_hint: "— 自动遮罩需要",
  hf_token_placeholder: "hf_…",
  upload_tap: "点击上传图片",
  upload_change: "点击更换图片",
  mask_enable: "启用遮罩（局部重绘）",
  mask_edit: "编辑遮罩",
  automask: "自动遮罩",
  label_size: "尺寸",
  label_scheduler: "调度器",
  scheduler_default: "默认",
  label_steps: "步数",
  label_cfg: "CFG 强度",
  label_seed: "随机种子",
  seed_random: "随机",
  label_clip_skip: "Clip 跳过",
  karras: "Karras 调度",
  use_opencl: "使用 OpenCL（为 CPU 模型启用 GPU）",
  generate: "生成",
  show_json: "显示 JSON",
  hide_json: "隐藏 JSON",
  download: "下载",
  details_title: "详情",
  label_time: "用时",
  label_mode: "模式",
  label_denoise_short: "去噪",
  progress_starting: "开始生成…",
  progress_done: "完成！",
  progress_step: "步骤",
  status_reachable: "Local Dream 连接正常。",
  status_unreachable: "Local Dream 无法连接 — 请先启动应用并加载模型。",
  error_no_prompt: "请输入提示词。",
  error_no_image: "请上传输入图片。",
  error_stream: "流错误",
  error_fetch: "请求错误",
  error_connect: "无法连接到 Local Dream。它是否在运行？",
  error_automask: "自动遮罩失败",
  crop_title: "调整图片位置",
  crop_fit: "适应",
  crop_fill: "填充",
  crop_center: "居中",
  crop_cancel: "取消",
  crop_confirm: "确认",
  crop_hint: "拖动调整位置 · 双指缩放 · 空白区域会自动外绘",
  mask_title: "绘制遮罩",
  mask_clear: "清除",
  mask_undo: "撤销",
  mask_invert: "反转",
  mask_brush: "画笔",
  mask_cancel: "取消",
  mask_done: "完成",
  mask_hint: "白色 = 重绘 · 黑色 = 保留 · 用手指或触控笔画画",
  automask_title: "分割区域",
  automask_segmenting: "分割中…",
  automask_pad: "扩展",
  automask_cancel: "取消",
  automask_apply: "应用遮罩",
  custom_size_placeholder: "例如 448",
  adjust_crop: "调整裁剪",
  ld_url_placeholder: "http://127.0.0.1:8081",
  ld_status_default: "默认",
  ld_status_custom: "自定义",
  preset_title: "预设",
  preset_default: "默认",
  preset_save: "保存",
  preset_delete: "删除",
  preset_name_prompt: "预设名称",
  preset_confirm_delete: "删除此预设？",
  preset_modal_save_title: "Save preset",
  preset_modal_delete_title: "Delete preset",
  preset_modal_delete_body: "Delete this preset?",
  label_aspect_ratio: "宽高比",
  aspect_none: "无",
  label_output_format: "输出格式",
  output_format_default: "默认（raw）",
  label_preview_format: "预览格式",
  preview_format_raw: "原始",
  label_diffusion_stride: "预览步长",
  advanced_options: "进阶选项",
  label_gen_time: "生成时间",
  label_first_step: "首步时间",
  label_upscaler_model: "放大模型",
  upscale: "放大 ×4",
  upscaling: "放大中…",
  error_upscaler_path: "请先在进阶选项中选中放大模型。",
  error_upscale: "放大失败",
  upscale_time: "放大用时",
  send_to_img2img: "发送到图生图",
  download_full: "下载全图",
  tap_to_upload: "点击上传图片",
  theme_label_apple: "Apple",
  theme_label_original: "Original",
  theme_toggle_title: "Toggle theme",
  lang_toggle_title: "Switch language",
  hf_token_show: "Show token",
  hf_token_hide: "Hide token",
  prompt_modal_title: "Confirm",
  prompt_modal_confirm: "OK",
  prompt_modal_cancel: "Cancel",
};

let mode = "txt2img";
let imgB64 = null; // final composited image (after crop)
let maskB64 = null; // final mask PNG (after mask editor or from crop)
let rawUploadedImg = null; // original uploaded Image object
let lastPayload = null;

// crop state
let cropImg = null,
  cropX = 0,
  cropY = 0,
  cropScale = 1;
let cropDragging = false,
  cropDragStart = { x: 0, y: 0, cx: 0, cy: 0 };
let cropPinchDist = 0;
let lastCropRegion = null; // {cropX, cropY, cropScale, cropImgW, cropImgH} for inpaint compositing

// mask state
let maskCtx = null,
  maskHistory = [],
  maskDrawing = false,
  maskLastX = 0,
  maskLastY = 0;

// automask state
let automaskSegments = [];
let automaskSelected = new Set();
let automaskBaseImg = null;
let automaskLastImgB64 = null;
let automaskPadding = 0;
const CLOTH_LABELS = new Set([
  "Upper-clothes",
  "Skirt",
  "Pants",
  "Dress",
  "Belt",
  "Left-shoe",
  "Right-shoe",
  "Bag",
  "Scarf",
  "Hat",
]);
const SEG_COLORS = {
  Hat: [255, 165, 0],
  Hair: [139, 69, 19],
  Sunglasses: [0, 210, 210],
  "Upper-clothes": [230, 50, 50],
  Skirt: [190, 50, 230],
  Pants: [50, 90, 230],
  Dress: [230, 100, 190],
  Belt: [210, 180, 30],
  "Left-shoe": [60, 200, 80],
  "Right-shoe": [40, 160, 60],
  Face: [255, 210, 160],
  "Left-leg": [170, 170, 170],
  "Right-leg": [140, 140, 140],
  "Left-arm": [210, 185, 165],
  "Right-arm": [190, 165, 145],
  Bag: [170, 130, 80],
  Scarf: [255, 100, 100],
};

// ─── Mode switching ─────────────────────────────────────────────────────────
document.querySelectorAll(".sub-nav-tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sub-nav-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    mode = btn.dataset.mode;
    $("img2imgSection").classList.toggle("collapsed", mode !== "img2img");
    if (mode !== "img2img") $("img2imgSection").classList.add("hidden");
    if (mode === "img2img") $("img2imgSection").classList.remove("hidden");
    $("upscaleSection").classList.toggle("hidden", mode !== "upscale");
    if (mode === "txt2img") {
      imgB64 = null;
      maskB64 = null;
      img2imgPaddingOffset = null;
      originalImgB64 = null;
      $("maskEnabled").checked = false;
    }
  }),
);

// ─── Mask toggle ─────────────────────────────────────────────────────────────
$("maskEnabled").addEventListener("change", () => {
  const on = $("maskEnabled").checked;
  $("editMaskBtn").classList.toggle("hidden", !on || !imgB64);
  $("automaskBtn").classList.toggle("hidden", !on || !imgB64);
  if (!on) {
    maskB64 = null;
    updateMaskThumb();
  }
});

// ─── Image upload → crop modal ───────────────────────────────────────────────
$("imgFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    originalImgB64 = ev.target.result.split(",")[1];
    const img = new Image();
    img.onload = () => {
      rawUploadedImg = img;
      openCropModal(img);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// ─── CROP MODAL ──────────────────────────────────────────────────────────────
function getTargetSize() {
  const sel = $("size").value;
  return sel === "custom" ? parseInt($("sizeCustom").value) || 512 : parseInt(sel);
}

function openCropModal(img) {
  cropImg = img;
  const targetSize = getTargetSize();
  const canvas = $("cropCanvas");
  canvas.width = targetSize;
  canvas.height = targetSize;

  // Display size: fit in viewport
  const displaySize = Math.min(window.innerWidth - 16, window.innerHeight - 160, 600);
  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";

  // Initial: fit inside canvas
  applyCropFit();
  openModal($("cropModal"));
  drawCrop();
}

function closeCropModal() {
  closeModal($("cropModal"));
}

function applyCropFit() {
  const sz = getTargetSize();
  cropScale = Math.min(sz / cropImg.width, sz / cropImg.height);
  cropX = (sz - cropImg.width * cropScale) / 2;
  cropY = (sz - cropImg.height * cropScale) / 2;
}
function applyCropFill() {
  const sz = getTargetSize();
  cropScale = Math.max(sz / cropImg.width, sz / cropImg.height);
  cropX = (sz - cropImg.width * cropScale) / 2;
  cropY = (sz - cropImg.height * cropScale) / 2;
}
function applyCropCenter() {
  const sz = getTargetSize();
  cropX = (sz - cropImg.width * cropScale) / 2;
  cropY = (sz - cropImg.height * cropScale) / 2;
}

function drawCrop() {
  const canvas = $("cropCanvas");
  const ctx = canvas.getContext("2d");
  const sz = canvas.width;
  // Checkerboard background
  const csz = 16;
  for (let y = 0; y < sz; y += csz)
    for (let x = 0; x < sz; x += csz) {
      ctx.fillStyle = ((x + y) / csz) % 2 === 0 ? "#e0e0e0" : "#f0f0f0";
      ctx.fillRect(x, y, csz, csz);
    }
  ctx.drawImage(cropImg, cropX, cropY, cropImg.width * cropScale, cropImg.height * cropScale);
}

// Crop touch/mouse events
const cropWrap = $("cropCanvasWrap");
cropWrap.addEventListener("mousedown", (e) => {
  cropDragging = true;
  cropDragStart = { x: e.clientX, y: e.clientY, cx: cropX, cy: cropY };
});
cropWrap.addEventListener("mousemove", (e) => {
  if (!cropDragging) return;
  const rect = $("cropCanvas").getBoundingClientRect();
  const scale = $("cropCanvas").width / rect.width;
  cropX = cropDragStart.cx + (e.clientX - cropDragStart.x) * scale;
  cropY = cropDragStart.cy + (e.clientY - cropDragStart.y) * scale;
  drawCrop();
});
cropWrap.addEventListener("mouseup", () => (cropDragging = false));

cropWrap.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      cropDragging = true;
      cropDragStart = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        cx: cropX,
        cy: cropY,
      };
    } else if (e.touches.length === 2) {
      cropDragging = false;
      cropPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  },
  { passive: false },
);

cropWrap.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && cropDragging) {
      const rect = $("cropCanvas").getBoundingClientRect();
      const scale = $("cropCanvas").width / rect.width;
      cropX = cropDragStart.cx + (e.touches[0].clientX - cropDragStart.x) * scale;
      cropY = cropDragStart.cy + (e.touches[0].clientY - cropDragStart.y) * scale;
      drawCrop();
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      const rect = $("cropCanvas").getBoundingClientRect();
      const s = $("cropCanvas").width / rect.width;
      const cx = (mid.x - rect.left) * s;
      const cy = (mid.y - rect.top) * s;
      const factor = dist / cropPinchDist;
      cropX = cx - (cx - cropX) * factor;
      cropY = cy - (cy - cropY) * factor;
      cropScale *= factor;
      cropPinchDist = dist;
      drawCrop();
    }
  },
  { passive: false },
);

cropWrap.addEventListener("touchend", (e) => {
  if (e.touches.length === 0) cropDragging = false;
});

$("cropFit").addEventListener("click", () => {
  applyCropFit();
  drawCrop();
});
$("cropFill").addEventListener("click", () => {
  applyCropFill();
  drawCrop();
});
$("cropCenter").addEventListener("click", () => {
  applyCropCenter();
  drawCrop();
});
$("cropZoomIn").addEventListener("click", () => {
  const sz = getTargetSize();
  const cx = sz / 2,
    cy = sz / 2;
  const f = 1.2;
  cropX = cx - (cx - cropX) * f;
  cropY = cy - (cy - cropY) * f;
  cropScale *= f;
  drawCrop();
});
$("cropZoomOut").addEventListener("click", () => {
  const sz = getTargetSize();
  const cx = sz / 2,
    cy = sz / 2;
  const f = 1 / 1.2;
  cropX = cx - (cx - cropX) * f;
  cropY = cy - (cy - cropY) * f;
  cropScale *= f;
  drawCrop();
});
$("adjustCropBtn").addEventListener("click", () => {
  if (cropImg) openCropModal(cropImg);
});
$("cropCancel").addEventListener("click", () => {
  closeCropModal();
  if (!imgB64) $("imgFile").value = "";
});
$("cropConfirm").addEventListener("click", () => {
  const canvas = $("cropCanvas");
  const sz = canvas.width;

  // Export composited image (gray fill for empty areas)
  const imgCanvas = document.createElement("canvas");
  imgCanvas.width = sz;
  imgCanvas.height = sz;
  const ictx = imgCanvas.getContext("2d");
  ictx.fillStyle = "#808080";
  ictx.fillRect(0, 0, sz, sz);
  ictx.drawImage(cropImg, cropX, cropY, cropImg.width * cropScale, cropImg.height * cropScale);
  imgB64 = imgCanvas.toDataURL("image/png").split(",")[1];
  // 裁剪后重置状态：清除填充偏移和 rawUploadedImg，
  // 让 compositeInpaint 使用非填充分支，直接在 (0,0) 绘制 gen 和 mask
  img2imgPaddingOffset = null;
  rawUploadedImg = null;
  lastCropRegion = {
    cropX,
    cropY,
    cropScale,
    cropImgW: cropImg.width,
    cropImgH: cropImg.height,
    targetSize: sz,
  };

  // Export outpaint mask (white where empty, black where image covers)
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = sz;
  maskCanvas.height = sz;
  const mctx = maskCanvas.getContext("2d");
  mctx.fillStyle = "white";
  mctx.fillRect(0, 0, sz, sz);
  mctx.fillStyle = "black";
  const ix = Math.max(0, cropX),
    iy = Math.max(0, cropY);
  const iw = Math.min(sz - ix, cropImg.width * cropScale - Math.max(0, -cropX));
  const ih = Math.min(sz - iy, cropImg.height * cropScale - Math.max(0, -cropY));
  if (iw > 0 && ih > 0) mctx.fillRect(ix, iy, iw, ih);

  // Check if there are any empty areas (white pixels)
  const mData = mctx.getImageData(0, 0, sz, sz).data;
  const hasEmpty = Array.from({ length: sz * sz }, (_, i) => mData[i * 4]).some((v) => v > 128);

  if (hasEmpty && $("maskEnabled").checked) {
    maskB64 = maskCanvas.toDataURL("image/png").split(",")[1];
    updateMaskThumb();
  } else if (!$("maskEnabled").checked && hasEmpty) {
    // auto-enable mask for outpaint
    $("maskEnabled").checked = true;
    $("editMaskBtn").classList.remove("hidden");
    maskB64 = maskCanvas.toDataURL("image/png").split(",")[1];
    updateMaskThumb();
  }

  $("imgPreview").src = imgCanvas.toDataURL("image/png");
  $("imgPreview").classList.remove("hidden");
  $("adjustCropBtn").classList.remove("hidden");
  $("imgUploadLabel").textContent = t("upload_change");
  $("automaskBtn").classList.remove("hidden");
  $("editMaskBtn").classList.remove("hidden");
  saveSession();
  closeCropModal();
});

// ─── MASK MODAL ───────────────────────────────────────────────────────────────
$("editMaskBtn").addEventListener("click", openMaskModal);

function openMaskModal() {
  if (!imgB64) return;
  // 从 imgB64 获取图片实际尺寸（支持非方形图）
  const tmpImg = new Image();
  tmpImg.onload = () => {
    const w = tmpImg.naturalWidth;
    const h = tmpImg.naturalHeight;
    const canvas = $("maskCanvas");
    canvas.width = w;
    canvas.height = h;

    const displaySize = Math.min(window.innerWidth - 0, window.innerHeight - 160, 700);
    const scale = Math.min(displaySize / w, displaySize / h);
    canvas.style.width = Math.round(w * scale) + "px";
    canvas.style.height = Math.round(h * scale) + "px";

    maskCtx = canvas.getContext("2d");

    if (maskB64) {
      const maskImg = new Image();
      maskImg.onload = () => maskCtx.drawImage(maskImg, 0, 0, w, h);
      maskImg.src = "data:image/png;base64," + maskB64;
    } else {
      maskCtx.clearRect(0, 0, w, h);
    }
    maskHistory = [];

    // 背景图
    const bg = $("maskCanvas").parentElement;
    bg.style.backgroundImage = `url(data:image/png;base64,${imgB64})`;
    bg.style.backgroundSize = canvas.style.width + " " + canvas.style.height;
    bg.style.backgroundRepeat = "no-repeat";
    bg.style.backgroundPosition = "center";
    bg.style.backgroundColor = "#000";

    canvas.style.opacity = "0.7";
    openModal($("maskModal"));
  };
  tmpImg.src = "data:image/png;base64," + imgB64;
}

function closeMaskModal() {
  closeModal($("maskModal"));
}

function maskCanvasPos(e) {
  const canvas = $("maskCanvas");
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return [(src.clientX - rect.left) * scaleX, (src.clientY - rect.top) * scaleY];
}

function maskStartDraw(e) {
  if (!maskCtx) return;
  e.preventDefault();
  maskDrawing = true;
  [maskLastX, maskLastY] = maskCanvasPos(e);
  maskHistory.push(maskCtx.getImageData(0, 0, $("maskCanvas").width, $("maskCanvas").height));
}
function maskDraw(e) {
  if (!maskDrawing || !maskCtx) return;
  e.preventDefault();
  const [x, y] = maskCanvasPos(e);
  const bs = parseInt($("brushSize").value);
  maskCtx.globalCompositeOperation = "source-over";
  maskCtx.strokeStyle = "#ffffff";
  maskCtx.lineWidth = bs;
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";
  maskCtx.beginPath();
  maskCtx.moveTo(maskLastX, maskLastY);
  maskCtx.lineTo(x, y);
  maskCtx.stroke();
  [maskLastX, maskLastY] = [x, y];
}
function maskEndDraw() {
  maskDrawing = false;
}

const mc = $("maskCanvas");
mc.addEventListener("mousedown", maskStartDraw);
mc.addEventListener("mousemove", maskDraw);
mc.addEventListener("mouseup", maskEndDraw);
mc.addEventListener("mouseleave", maskEndDraw);
mc.addEventListener("touchstart", maskStartDraw, { passive: false });
mc.addEventListener("touchmove", maskDraw, { passive: false });
mc.addEventListener("touchend", maskEndDraw);

$("maskClear").addEventListener("click", () => {
  if (!maskCtx) return;
  maskHistory.push(maskCtx.getImageData(0, 0, $("maskCanvas").width, $("maskCanvas").height));
  maskCtx.clearRect(0, 0, $("maskCanvas").width, $("maskCanvas").height);
});
$("maskUndo").addEventListener("click", () => {
  if (!maskCtx || maskHistory.length === 0) return;
  maskCtx.putImageData(maskHistory.pop(), 0, 0);
});
$("maskInvert").addEventListener("click", () => {
  if (!maskCtx) return;
  const c = $("maskCanvas");
  maskHistory.push(maskCtx.getImageData(0, 0, c.width, c.height));
  const d = maskCtx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] === 0) continue; // leave transparent pixels transparent
    d.data[i] = 255 - d.data[i];
    d.data[i + 1] = 255 - d.data[i + 1];
    d.data[i + 2] = 255 - d.data[i + 2];
    // alpha unchanged
  }
  maskCtx.putImageData(d, 0, 0);
});
$("maskCancel").addEventListener("click", closeMaskModal);
$("maskDone").addEventListener("click", () => {
  exportMask();
  closeMaskModal();
});

function exportMask() {
  const canvas = $("maskCanvas");
  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  octx.fillStyle = "black";
  octx.fillRect(0, 0, w, h);
  octx.drawImage(canvas, 0, 0);
  maskB64 = off.toDataURL("image/png").split(",")[1];
  updateMaskThumb();
  saveSession();
}

function saveSession() {
  try {
    if (imgB64) sessionStorage.setItem("imgB64", imgB64);
    else sessionStorage.removeItem("imgB64");
    if (maskB64) sessionStorage.setItem("maskB64", maskB64);
    else sessionStorage.removeItem("maskB64");
    sessionStorage.setItem("maskEnabled", $("maskEnabled").checked ? "1" : "0");
    if (rawUploadedImg) sessionStorage.setItem("rawImgSrc", rawUploadedImg.src);
    if (lastCropRegion) sessionStorage.setItem("lastCropRegion", JSON.stringify(lastCropRegion));
    else sessionStorage.removeItem("lastCropRegion");
  } catch (e) {
    /* storage full — skip */
  }
}

function restoreSession() {
  const storedImg = sessionStorage.getItem("imgB64");
  if (!storedImg) return;
  imgB64 = storedImg;
  maskB64 = sessionStorage.getItem("maskB64") || null;

  // Switch to img2img mode
  document.querySelectorAll(".sub-nav-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(".sub-nav-tab[data-mode='img2img']").classList.add("active");
  mode = "img2img";
  $("img2imgSection").classList.remove("hidden");
  $("img2imgSection").classList.remove("collapsed");

  $("imgPreview").src = "data:image/png;base64," + imgB64;
  $("imgPreview").classList.remove("hidden");
  $("adjustCropBtn").classList.remove("hidden");
  $("imgUploadLabel").textContent = t("upload_change");
  $("automaskBtn").classList.remove("hidden");
  $("editMaskBtn").classList.remove("hidden");

  if (maskB64) {
    const enabled = sessionStorage.getItem("maskEnabled") === "1";
    $("maskEnabled").checked = enabled;
    updateMaskThumb();
  }

  const stored = sessionStorage.getItem("lastCropRegion");
  if (stored)
    try {
      lastCropRegion = JSON.parse(stored);
    } catch (e) {}

  // Restore original image for re-cropping
  const rawSrc = sessionStorage.getItem("rawImgSrc");
  if (rawSrc) {
    const img = new Image();
    img.onload = () => {
      rawUploadedImg = img;
      cropImg = img;
    };
    img.src = rawSrc;
  }
}

function updateMaskThumb() {
  const overlay = $("maskOverlay");
  if (!maskB64 || !imgB64) {
    overlay.style.display = "none";
    return;
  }
  overlay.style.display = "block";
  const ctx = overlay.getContext("2d");
  const img = new Image();
  img.onload = () => {
    // overlay canvas 必须匹配 imgPreview 当前显示的图片尺寸
    // sendToImg2img 后 imgPreview.src = 上一次生成图（unpadded 576x1024）
    // 但 maskB64 是 padded 1024x1024 上画的
    const preview = $("imgPreview");
    const pw = preview.naturalWidth || img.naturalWidth;
    const ph = preview.naturalHeight || img.naturalHeight;
    overlay.width = pw;
    overlay.height = ph;
    ctx.clearRect(0, 0, pw, ph);
    if (img.naturalWidth === pw && img.naturalHeight === ph) {
      // 尺寸一致：直接绘制
      ctx.drawImage(img, 0, 0, pw, ph);
    } else {
      // 尺寸不一致：从 padded mask 中裁出对应区域
      const ox = img2imgPaddingOffset ? img2imgPaddingOffset.x : 0;
      const oy = img2imgPaddingOffset ? img2imgPaddingOffset.y : 0;
      ctx.drawImage(img, ox, oy, pw, ph, 0, 0, pw, ph);
    }
    const d = ctx.getImageData(0, 0, pw, ph);
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i] > 128) {
        d.data[i] = 124;
        d.data[i + 1] = 58;
        d.data[i + 2] = 237;
        d.data[i + 3] = 150;
      } else d.data[i + 3] = 0;
    }
    ctx.putImageData(d, 0, 0);
  };
  img.src = "data:image/png;base64," + maskB64;
}

// ─── ParamsForm / ParamsPayload 实例化 ────────────────────────────────────────
// 启动时一次性装联动事件（slider 显示标签、size custom 可见性、seedRandom 可见性、
// textarea auto-resize）由 ParamsForm.bind() 内部完成，调用方不再重复装。
const ParamsForm = createParamsForm({ $ });
const ParamsPayload = createParamsPayload();
ParamsForm.bind();

// ─── Upscaler presets ──────────────────────────────────────────────────────
const UPSCALER_PRESETS = {
  anime: {
    name: "Real-ESRGAN Anime",
    path: "/data/data/io.github.xororz.localdream/files/models/upscaler_anime/upscaler.bin",
  },
  realistic: {
    name: "UltraSharp Realistic",
    path: "/data/data/io.github.xororz.localdream/files/models/upscaler_realistic/upscaler.bin",
  },
};

// Restore saved selection for both selects
function syncUpscalerSelects(val) {
  $("upscalerSelect").value = val;
  $("upscaleModelSelect").value = val;
}
const savedUpscaler = localStorage.getItem("upscalerPreset");
if (savedUpscaler && UPSCALER_PRESETS[savedUpscaler]) {
  syncUpscalerSelects(savedUpscaler);
}
const upscalerSelect = $("upscalerSelect");
upscalerSelect.addEventListener("change", () => {
  localStorage.setItem("upscalerPreset", upscalerSelect.value);
  $("upscaleModelSelect").value = upscalerSelect.value;
});
$("upscaleModelSelect").addEventListener("change", () => {
  localStorage.setItem("upscalerPreset", $("upscaleModelSelect").value);
  $("upscalerSelect").value = $("upscaleModelSelect").value;
});

// ─── Standalone upscale ────────────────────────────────────────────────────
let upscaleFileB64 = null;
$("upscaleFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    upscaleFileB64 = ev.target.result.split(",")[1];
    $("upscalePreview").src = ev.target.result;
    $("upscalePreview").classList.remove("hidden");
    $("upscaleUploadLabel").textContent = t("upload_change") || "Change";
    $("upscaleResult").classList.add("hidden");
  };
  reader.readAsDataURL(file);
});
$("upscaleRunBtn").addEventListener("click", async () => {
  if (!upscaleFileB64) {
    showError(t("error_no_image") || "No image");
    return;
  }
  // Get image dimensions from preview
  const img = $("upscalePreview");
  const w = img.naturalWidth,
    h = img.naturalHeight;
  if (!w || !h) return;
  const presetId = $("upscaleModelSelect").value;
  const preset = UPSCALER_PRESETS[presetId];
  if (!preset) {
    showError(t("error_upscaler_path"));
    return;
  }
  const btn = $("upscaleRunBtn");
  btn.disabled = true;
  btn.textContent = t("upscaling") || "Upscaling…";
  try {
    const payload = {
      image: upscaleFileB64,
      width: w,
      height: h,
      upscaler_path: preset.path,
      use_opencl: false,
    };
    const ldUrl = $("ldUrl"),
      ldToggle = $("ldToggle");
    if (ldToggle && ldToggle.checked && ldUrl && ldUrl.value.trim())
      payload.local_dream_url = ldUrl.value.trim();
    const res = await fetch("/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({ error: res.statusText }))).error || res.statusText,
      );
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    $("upscaleResultImg").src = url;
    $("upscaleDlBtn").href = url;
    $("upscaleResult").classList.remove("hidden");
  } catch (e) {
    showError(t("error_upscale") + ": " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t("upscale") || "Upscale ×4";
  }
});

// Track last output for upscale
let lastOutputB64 = null;
let lastOutputWidth = 0;
let lastOutputHeight = 0;
let lastCompleteData = null;
let lastFullComposite = null;
let originalImgB64 = null; // original uploaded/source image base64 (unpadded, uncropped)
let origImgWidth = 0,
  origImgHeight = 0;
// sendToImg2img 填充非方形图到正方形时记录偏移量，供 compositeInpaint 定位
let img2imgPaddingOffset = null;

// 启动后给 textarea 补一次 resize()（ParamsForm.bind 不主动调初始 resize，
// 避免 bind() 职责膨胀；调用方一次性 dispatch input 触发即可）。
for (const id of ["prompt", "negPrompt"]) {
  const ta = $(id);
  if (ta) ta.dispatchEvent(new Event("input"));
}

// ─── Token count ──────────────────────────────────────────────────────────────
// 实时查询 /tokenize 端点显示 prompt token 数。
let tokenCountTimer = null;
async function updateTokenCount() {
  const prompt = $("prompt").value.trim();
  if (!prompt) {
    $("tokenCount").textContent = "";
    return;
  }
  try {
    const body = { prompt };
    const ldToggle = $("ldToggle");
    const ldUrl = $("ldUrl");
    if (ldToggle && ldToggle.checked && ldUrl && ldUrl.value.trim()) {
      body.local_dream_url = ldUrl.value.trim();
    }
    const res = await fetch("/tokenize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.count != null) {
      $("tokenCount").textContent = `${data.count} / ${data.max_length || 77} tokens`;
    }
  } catch {
    // 静默忽略：tokenize 失败不影响生成
  }
}
$("prompt").addEventListener("input", () => {
  clearTimeout(tokenCountTimer);
  tokenCountTimer = setTimeout(updateTokenCount, 300);
});
// 启动时延迟一次查询
setTimeout(updateTokenCount, 500);

// ─── Build payload ────────────────────────────────────────────────────────────
// 旧 buildPayload(omitImages) 函数已删除；参数由 ParamsPayload.fromForm(snap)
// 生成。debug JSON 路径仍保留 omitImages 参数用于把 image / mask 替换成
// "(base64 omitted)" 占位字符串；生产路径用 buildWirePayload(false)。
// img2img 专属字段（image / mask / denoise_strength）由 buildWirePayload 手动
// 注入到 wire；mode 是 UI 状态不进 wire（renderDetails 直接读模块级变量）。

// ─── Generate ────────────────────────────────────────────────────────────────
$("genBtn").addEventListener("click", generate);

// 把表单 snap + 图像状态 / mode 合并成 wire payload（生成 /generate 请求体用）。
//   - image / mask 在 img2img 模式下注入；txt2img 模式下不出现。
//   - denoise_strength 仅在 img2img 模式下注入。
//   - mode 由调用方决定（"txt2img" / "img2img"），不进 ParamsForm。
// omitImages=true 用于调试 JSON 展示：把 image / mask 替换为 "(base64 omitted)"。
function buildWirePayload(omitImages = false) {
  const snap = ParamsForm.read();
  const wire = ParamsPayload.fromForm(snap);
  // aspect_ratio 适用于 SDXL 模型，需要 size=1024 才能生效
  // （否则 LD 按原 size 生成方形图，忽略 aspect_ratio）
  if (wire.aspect_ratio && wire.aspect_ratio !== "none") {
    wire.size = 1024;
  }
  if (mode === "img2img") {
    wire.image = omitImages ? "(base64 omitted)" : imgB64;
    wire.denoise_strength = parseFloat($("denoise").value);
    if ($("maskEnabled").checked && maskB64) {
      wire.mask = omitImages ? "(base64 omitted)" : maskB64;
    }
  }
  return wire;
}

function generate() {
  const prompt = $("prompt").value.trim();
  if (!prompt) {
    showError(t("error_no_prompt"));
    return;
  }
  if (mode === "img2img" && !imgB64) {
    showError(t("error_no_image"));
    return;
  }

  hideError();
  const payload = buildWirePayload(false);
  // lastPayload 用于 details panel / compositeInpaint：保留 wire 形态
  // （prompt / size / steps / cfg / denoise_strength 等），同时把图像字段
  // 提至顶层供 renderDetails 和 img2img compositeInpaint 直接读。
  lastPayload = {
    ...payload,
    image: imgB64,
    mask: $("maskEnabled").checked ? maskB64 : null,
  };

  $("genBtn").disabled = true;
  $("genBtn").setAttribute("aria-busy", "true");
  $("genSpinner").hidden = false;
  $("genLabel").textContent = t("progress_starting");
  $("outputTile").style.display = "none";
  $("progressWrap").style.display = "block";
  $("progressFill").style.width = "0%";
  $("progressLabel").textContent = t("progress_starting");

  fetch("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      function read() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              finishGen();
              return;
            }
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop();
            for (const chunk of parts) parseSSEChunk(chunk);
            read();
          })
          .catch((err) => {
            showError(t("error_stream") + ": " + err);
            finishGen();
          });
      }
      read();
    })
    .catch((err) => {
      showError(t("error_fetch") + ": " + err);
      finishGen();
    });
}

function parseSSEChunk(chunk) {
  let eventType = null,
    dataStr = null;
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
  }
  if (!dataStr || dataStr === "[DONE]") return;
  let data;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }

  // 优先以 SSE event: 字段分派（来自后端 EVENT_HANDLERS 注册的事件类型），
  // 缺省时回退到 data.type 字段（兼容旧版 Local Dream 把类型塞在 JSON 里）。
  const evt = eventType || data.type;

  if (evt === "progress") {
    // 后端 progress_handler 已尽力算出 percent；多字段名兜底以防上游变种。
    const step = Number(data.step) || 0;
    const total = Number(data.total ?? data.total_steps ?? data.max_steps ?? data.steps) || 0;
    let pct;
    if (typeof data.percent === "number") {
      pct = Math.max(0, Math.min(100, data.percent));
    } else if (total > 0) {
      pct = Math.round((step / total) * 100);
    } else {
      pct = 0;
    }
    $("progressFill").style.width = pct + "%";
    const displayTotal = total > 0 ? total : lastPayload ? lastPayload.steps : 0;
    const displayStep = displayTotal > 0 ? Math.min(step, displayTotal) : step;
    $("progressLabel").textContent =
      displayTotal > 0
        ? `${t("progress_step")} ${displayStep} / ${displayTotal}`
        : t("progress_starting");
  } else if (evt === "complete") {
    $("progressFill").style.width = "100%";
    $("progressLabel").textContent = t("progress_done");
    renderDetails(data);
    $("outputTile").style.display = "block";
    const setOutput = (src) => {
      $("outputImg").src = src;
      $("dlBtn").href = src;
      if (data.width && data.height) {
        $("outputImg").width = data.width;
        $("outputImg").height = data.height;
        lastOutputWidth = data.width;
        lastOutputHeight = data.height;
      }
    };
    lastOutputB64 = data.png_image;
    lastCompleteData = data;
    lastFullComposite = null;
    $("dlFullBtn").classList.add("hidden");
    if (mode === "img2img" && lastCropRegion) {
      const mask = lastPayload && lastPayload.mask;
      if (img2imgPaddingOffset) {
        const rawSrc = "data:image/png;base64," + data.png_image;
        setOutput(rawSrc);
        if (mask) {
          compositeInpaint(lastPayload.image, data.png_image, mask).then((src) => {
            setOutput(src);
            lastOutputB64 = src.split(",")[1];
            stitchFullToOriginal(src);
          });
        } else {
          stitchFullToOriginal(rawSrc);
        }
      } else if (mask) {
        compositeInpaint(lastPayload.image, data.png_image, mask).then((src) => {
          setOutput(src);
          lastOutputB64 = src.split(",")[1];
          stitchFullToOriginal(src);
        });
      } else {
        setOutput("data:image/png;base64," + data.png_image);
        stitchFullToOriginal("data:image/png;base64," + data.png_image);
      }
    } else {
      setOutput("data:image/png;base64," + data.png_image);
    }
    function showDlFull(src) {
      if (!src) return;
      lastFullComposite = src;
      $("dlFullBtn").classList.remove("hidden");
      $("dlFullBtn").href = src;
    }
    function stitchFullToOriginal(genB64) {
      // crop_result (LD 输出) 缩放到 crop 尺寸，替换进 origin 对应位置
      if (!originalImgB64 || !lastCropRegion) return;
      const { cropX, cropY, cropScale, targetSize } = lastCropRegion;
      const base = new Image();
      const gen = new Image();
      let loaded = 0;
      const tryShow = () => {
        loaded++;
        if (loaded < 2) return;
        const ow = base.naturalWidth,
          oh = base.naturalHeight;
        const off = document.createElement("canvas");
        off.width = ow;
        off.height = oh;
        const ctx = off.getContext("2d");
        ctx.drawImage(base, 0, 0);
        if (img2imgPaddingOffset) {
          // 填充案例：gen 可能是 padded 1024×1024 或已裁减到原图尺寸
          const { x: ox, y: oy, origW, origH } = img2imgPaddingOffset;
          const gw = gen.naturalWidth,
            gh = gen.naturalHeight;
          if (gw > origW) {
            // Padded raw gen（1024×1024）— 从 padding offset 裁剪
            ctx.drawImage(gen, ox, oy, origW, origH, 0, 0, origW, origH);
          } else {
            // 已裁减到原图尺寸（compositeInpaint 结果）— 1:1 覆盖
            ctx.drawImage(gen, 0, 0, ow, oh);
          }
        } else {
          // 裁剪案例：gen 缩放到 crop 区域大小后覆盖到 origin 上
          const gw = gen.naturalWidth,
            gh = gen.naturalHeight;
          const cropL = -cropX / cropScale;
          const cropT = -cropY / cropScale;
          const cropW = targetSize / cropScale;
          const cropH = targetSize / cropScale;
          const ow2 = base.naturalWidth,
            oh2 = base.naturalHeight;
          const ol = Math.max(0, cropL);
          const ot = Math.max(0, cropT);
          const or2 = Math.min(ow2, cropL + cropW);
          const ob2 = Math.min(oh2, cropT + cropH);
          const cw = or2 - ol,
            ch = ob2 - ot;
          if (cw > 0 && ch > 0) {
            const sl = ((ol - cropL) / cropW) * gw;
            const st = ((ot - cropT) / cropH) * gh;
            const sw = (cw / cropW) * gw;
            const sh = (ch / cropH) * gh;
            ctx.drawImage(gen, sl, st, sw, sh, ol, ot, cw, ch);
          }
        }
        showDlFull(off.toDataURL("image/png"));
      };
      base.onload = tryShow;
      base.src = "data:image/png;base64," + originalImgB64;
      gen.onload = tryShow;
      gen.src = genB64;
    }
    // 重置 upscale 按钮状态
    $("upscaleBtn").disabled = false;
    $("upscaleBtn").textContent = t("upscale");
  } else if (evt === "error") {
    showError(t("error_connect"));
  }
}

function renderDetails(data) {
  const p = lastPayload || {};
  const schedulerLabels = {
    euler: "Euler",
    euler_a: "Euler Ancestral",
    lcm: "LCM",
    "dpm++2m": "DPM++ 2M",
    "dpm++2m_sde": "DPM++ 2M SDE",
    "": "",
  };
  const items = [
    [t("label_steps"), data.steps ?? p.steps],
    ["CFG", data.cfg ?? p.cfg],
    ["Size", `${data.width}×${data.height}`],
    [t("label_seed"), data.seed ?? p.seed],
    [t("label_mode"), mode],
    [
      t("label_scheduler"),
      schedulerLabels[data.scheduler ?? p.scheduler ?? ""] ?? t("scheduler_default"),
    ],
    data.generation_time_ms != null
      ? [t("label_time"), `${(data.generation_time_ms / 1000).toFixed(1)}s`]
      : null,
    data.first_step_time_ms != null
      ? [t("label_first_step"), `${data.first_step_time_ms}ms`]
      : null,
    p.denoise_strength != null ? [t("label_denoise_short"), p.denoise_strength] : null,
  ].filter(Boolean);
  $("detailsGrid").innerHTML = items
    .map(
      ([k, v]) =>
        `<div class="detail-item"><span class="detail-label">${k}:</span><span class="detail-val">${v}</span></div>`,
    )
    .join("");
}

function finishGen() {
  $("genBtn").disabled = false;
  $("genBtn").setAttribute("aria-busy", "false");
  $("genSpinner").hidden = true;
  $("genLabel").textContent = t("generate");
}

// ─── Upscale ──────────────────────────────────────────────────────────────
$("upscaleBtn").addEventListener("click", upscaleOutput);
$("img2imgBtn").addEventListener("click", sendToImg2img);

async function upscaleOutput() {
  if (!lastOutputB64 || !lastOutputWidth || !lastOutputHeight) return;
  const presetId = $("upscalerSelect").value;
  const preset = UPSCALER_PRESETS[presetId];
  if (!preset) {
    showError(t("error_upscaler_path"));
    return;
  }
  const btn = $("upscaleBtn");
  btn.disabled = true;
  btn.textContent = t("upscaling");
  hideError();
  try {
    const payload = {
      image: lastOutputB64,
      width: lastOutputWidth,
      height: lastOutputHeight,
      upscaler_path: preset.path,
      use_opencl: $("useOpenCL").checked,
    };
    const ldUrl = $("ldUrl");
    const ldToggle = $("ldToggle");
    if (ldToggle && ldToggle.checked && ldUrl && ldUrl.value.trim()) {
      payload.local_dream_url = ldUrl.value.trim();
    }
    const res = await fetch("/upscale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const outW = res.headers.get("X-Output-Width") || lastOutputWidth * 4;
    const outH = res.headers.get("X-Output-Height") || lastOutputHeight * 4;
    $("outputImg").src = url;
    $("outputImg").width = parseInt(outW);
    $("outputImg").height = parseInt(outH);
    $("dlBtn").href = url;
    // 更新详情
    const dur = res.headers.get("X-Duration-Ms");
    const detailsEl = $("detailsGrid");
    const durRow = dur
      ? `<div class="detail-item"><span class="detail-label">${t("upscale_time")}:</span><span class="detail-val">${parseInt(dur) / 1000}s</span></div>`
      : "";
    detailsEl.insertAdjacentHTML(
      "beforeend",
      `<div class="detail-item"><span class="detail-label">${t("label_size")}:</span><span class="detail-val">${outW}×${outH}</span></div>${durRow}`,
    );
  } catch (e) {
    showError(t("error_upscale") + ": " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = t("upscale");
  }
}

// ─── Send to img2img ──────────────────────────────────────────────────────

// SDXL img2img 需要方形画布，将非方形图加黑边填充到正方形
function padImageToSquare(base64, targetSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width === img.height) {
        resolve(base64);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, targetSize, targetSize);
      const scale = Math.min(targetSize / img.width, targetSize / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (targetSize - w) / 2, (targetSize - h) / 2, w, h);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    img.src = "data:image/png;base64," + base64;
  });
}

async function sendToImg2img() {
  const b64 = lastOutputB64;
  if (!b64) return;
  hideError();
  // 获取图片实际尺寸
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = "data:image/png;base64," + b64;
  });
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  // 根据图片实际比例算 aspect_ratio
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(iw, ih);
  const arStr = iw === ih ? "none" : `${iw / g}:${ih / g}`;
  const isNonSquare = iw !== ih;

  // SDXL 需要 1024×1024 画布；将非方形图加黑边填充
  const workB64 = isNonSquare ? await padImageToSquare(b64, 1024) : b64;

  // 保存填充后的图片供 Download Full 合成使用（裁剪坐标基于填充后的画布）
  originalImgB64 = workB64;
  // 保存原图 unpadded 尺寸供裁剪坐标映射用
  origImgWidth = iw;
  origImgHeight = ih;

  // 记录填充偏移量（含原始尺寸）
  if (isNonSquare) {
    const scale = Math.min(1024 / iw, 1024 / ih);
    const w = Math.round(iw * scale);
    const h = Math.round(ih * scale);
    img2imgPaddingOffset = {
      x: Math.round((1024 - w) / 2),
      y: Math.round((1024 - h) / 2),
      origW: iw,
      origH: ih,
    };
  } else {
    img2imgPaddingOffset = null;
  }

  const data = lastCompleteData || {};
  const p = lastPayload || {};
  const snap = {
    prompt: p.prompt || "",
    negative_prompt: p.negative_prompt || "",
    size: isNonSquare ? 1024 : data.width || p.size || 512,
    steps: data.steps || p.steps || 20,
    cfg: data.cfg || p.cfg || 7.0,
    scheduler: p.scheduler || "",
    karras: p.karras || false,
    use_opencl: p.use_opencl || false,
    clip_skip: p.clip_skip || 1,
    seed: data.seed ?? p.seed ?? null,
    local_dream_url: p.local_dream_url || "",
    aspect_ratio: arStr,
    output_format: p.output_format || "",
    preview_format: p.preview_format || "",
    show_diffusion_stride: p.show_diffusion_stride || 1,
  };
  ParamsForm.apply(snap);
  // 设 denoise 滑块默认值
  const denoise = $("denoise");
  if (denoise) {
    denoise.value = "0.6";
    denoise.dispatchEvent(new Event("input"));
  }
  // 清除旧遮罩
  maskB64 = null;
  $("maskEnabled").checked = false;
  // 设置图片（用填充后的方形图）
  imgB64 = workB64;
  const paddedImg = new Image();
  paddedImg.onload = () => {
    rawUploadedImg = paddedImg;
    cropImg = paddedImg;
    lastCropRegion = {
      cropX: 0,
      cropY: 0,
      cropScale: 1,
      cropImgW: paddedImg.naturalWidth,
      cropImgH: paddedImg.naturalHeight,
      targetSize: 1024,
    };
  };
  paddedImg.src = "data:image/png;base64," + workB64;
  // 切换到 img2img 模式
  document.querySelectorAll(".sub-nav-tab").forEach((t) => t.classList.remove("active"));
  document.querySelector(".sub-nav-tab[data-mode='img2img']").classList.add("active");
  mode = "img2img";
  $("img2imgSection").classList.remove("hidden");
  $("img2imgSection").classList.remove("collapsed");
  $("imgPreview").src = "data:image/png;base64," + b64;
  $("imgPreview").classList.remove("hidden");
  $("adjustCropBtn").classList.remove("hidden");
  $("imgUploadLabel").textContent = t("upload_change");
  $("automaskBtn").classList.remove("hidden");
  $("editMaskBtn").classList.remove("hidden");
  saveSession();
}

async function compositeInpaint(origB64, genB64, maskB64) {
  const load = (b64) =>
    new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = "data:image/png;base64," + b64;
    });
  const [origImg, genImg, maskImg] = await Promise.all([origB64, genB64, maskB64].map(load));

  const ow = origImg.naturalWidth,
    oh = origImg.naturalHeight;

  // (featherMask 已移除 — 未使用；合成直接做硬遮罩混合)

  if (img2imgPaddingOffset) {
    // 填充案例：在 1024×1024 padded space 合成（三者坐标对齐），最后裁剪
    const padded = 1024;
    const ox = img2imgPaddingOffset.x,
      oy = img2imgPaddingOffset.y;
    const off = document.createElement("canvas");
    off.width = padded;
    off.height = padded;
    const ctx = off.getContext("2d");

    // 原图（padded 尺寸）
    ctx.drawImage(origImg, 0, 0, padded, padded);
    const origData = ctx.getImageData(0, 0, padded, padded);

    // 生成图（放到偏移位置，用生成图自身尺寸而非 padded 尺寸）
    const gw = genImg.naturalWidth,
      gh = genImg.naturalHeight;
    ctx.clearRect(0, 0, padded, padded);
    ctx.drawImage(genImg, ox, oy, gw, gh);
    const genData = ctx.getImageData(0, 0, padded, padded);

    // 遮罩（padded 尺寸）
    ctx.clearRect(0, 0, padded, padded);
    ctx.drawImage(maskImg, 0, 0, padded, padded);
    const maskData = ctx.getImageData(0, 0, padded, padded);

    // 合成
    const out = ctx.createImageData(padded, padded);
    for (let i = 0; i < out.data.length; i += 4) {
      const m = maskData.data[i] / 255;
      out.data[i] = origData.data[i] * (1 - m) + genData.data[i] * m;
      out.data[i + 1] = origData.data[i + 1] * (1 - m) + genData.data[i + 1] * m;
      out.data[i + 2] = origData.data[i + 2] * (1 - m) + genData.data[i + 2] * m;
      out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);

    // 裁剪回原始尺寸（从 padding offset 取原始 unpadded 尺寸）
    const { origW, origH } = img2imgPaddingOffset;
    const crop = document.createElement("canvas");
    crop.width = origW;
    crop.height = origH;
    crop.getContext("2d").drawImage(off, ox, oy, origW, origH, 0, 0, origW, origH);
    return crop.toDataURL("image/png");
  }

  // 普通/裁剪案例
  const off = document.createElement("canvas");
  off.width = ow;
  off.height = oh;
  const ctx = off.getContext("2d");

  let drawX, drawY, drawW, drawH;
  if (rawUploadedImg && lastCropRegion) {
    const { cropX, cropY, cropScale } = lastCropRegion;
    drawX = -cropX / cropScale;
    drawY = -cropY / cropScale;
    drawW = genImg.naturalWidth / cropScale;
    drawH = genImg.naturalHeight / cropScale;
  } else {
    drawX = 0;
    drawY = 0;
    drawW = ow;
    drawH = oh;
  }

  ctx.drawImage(rawUploadedImg || origImg, 0, 0);
  const origData = ctx.getImageData(0, 0, ow, oh);

  ctx.clearRect(0, 0, ow, oh);
  ctx.drawImage(genImg, drawX, drawY, drawW, drawH);
  const genData = ctx.getImageData(0, 0, ow, oh);

  ctx.clearRect(0, 0, ow, oh);
  ctx.drawImage(maskImg, drawX, drawY, drawW, drawH);
  const maskData = ctx.getImageData(0, 0, ow, oh);

  const out = ctx.createImageData(ow, oh);
  for (let i = 0; i < out.data.length; i += 4) {
    const m = maskData.data[i] / 255;
    out.data[i] = origData.data[i] * (1 - m) + genData.data[i] * m;
    out.data[i + 1] = origData.data[i + 1] * (1 - m) + genData.data[i + 1] * m;
    out.data[i + 2] = origData.data[i + 2] * (1 - m) + genData.data[i + 2] * m;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return off.toDataURL("image/png");
}
function showError(msg) {
  $("errorText").textContent = msg;
  renderIcon($("errorIcon"), "alert-triangle");
  $("errorMsg").classList.add("shown");
}
function hideError() {
  $("errorMsg").classList.remove("shown");
}

// ─── Debug JSON ───────────────────────────────────────────────────────────────
$("debugBtn").addEventListener("click", () => {
  const box = $("debugBox");
  if (box.style.display !== "none") {
    box.style.display = "none";
    $("debugBtn").textContent = t("show_json");
    return;
  }
  box.textContent = redactBinaries(buildWirePayload(true));
  box.style.display = "block";
  $("debugBtn").textContent = t("hide_json");
});

// ─── HF Token persistence ────────────────────────────────────────────────────
$("hfToken").value = localStorage.getItem("hfToken") || "";
$("hfToken").addEventListener("input", () => localStorage.setItem("hfToken", $("hfToken").value));

const hfTokenToggle = $("hfTokenToggle");
renderIcon($("hfTokenIcon"), "eye");
hfTokenToggle.addEventListener("click", () => {
  const inp = $("hfToken");
  const showing = inp.type === "text";
  inp.type = showing ? "password" : "text";
  renderIcon($("hfTokenIcon"), showing ? "eye" : "eye-off");
  const label = showing ? t("hf_token_show") : t("hf_token_hide");
  hfTokenToggle.setAttribute("aria-label", label);
  hfTokenToggle.setAttribute("title", label);
});

// Local Dream URL persistence
const ldUrl = $("ldUrl");
const ldToggle = $("ldToggle");
ldUrl.value = localStorage.getItem("ldUrl") || "";
ldToggle.checked = localStorage.getItem("ldEnabled") === "1";
ldUrl.disabled = !ldToggle.checked;
document.getElementById("ldStatusLabel").textContent = ldToggle.checked
  ? t("ld_status_custom")
  : t("ld_status_default");

function checkHealth() {
  let baseUrl = $("ldUrl").value.trim();
  if (baseUrl && !baseUrl.startsWith("http")) {
    baseUrl = "http://" + baseUrl;
  }
  const url =
    $("ldToggle").checked && baseUrl ? "/health?url=" + encodeURIComponent(baseUrl) : "/health";
  fetch(url)
    .then((r) => r.json())
    .then((d) => {
      const dot = $("statusDot");
      const text = $("statusText");
      dot.className = "status-dot " + (d.ok ? "ok" : "err");
      text.textContent = d.ok ? t("status_reachable") : t("status_unreachable");
    });
}

// Health check on load and every 10s
checkHealth();
setInterval(checkHealth, 10000);

ldUrl.addEventListener("input", () => {
  localStorage.setItem("ldUrl", ldUrl.value);
  checkHealth();
});

ldToggle.addEventListener("change", () => {
  const enabled = ldToggle.checked;
  ldUrl.disabled = !enabled;
  if (enabled) ldUrl.value = localStorage.getItem("ldUrl") || "";
  document.getElementById("ldStatusLabel").textContent = enabled
    ? t("ld_status_custom")
    : t("ld_status_default");
  localStorage.setItem("ldEnabled", enabled ? "1" : "0");
  checkHealth();
});

// ─── Presets ─────────────────────────────────────────────────────────────────
// 旧 preset（改 refactor 前）保存的 size 是 select 字符串（"512" / "custom"）；
// 新 preset 存的是 parseInt 后的整数（512 / 768 或 800 表示走 custom 路径）。
// loadPresets 时一次性 sanitize：把字符串 size 转整数，让 ParamsForm.apply 的
// ALLOWED_SIZES 判定正常工作。
function sanitizePreset(p) {
  if (!p || typeof p !== "object") return p;
  if (typeof p.size === "string") p.size = parseInt(p.size) || 512;
  return p;
}

function loadPresets() {
  const presets = JSON.parse(localStorage.getItem("presets") || "{}");
  const sel = $("presetSelect");
  sel.innerHTML = '<option value="" data-i18n="preset_default">Default</option>';
  for (const name of Object.keys(presets).sort()) {
    sanitizePreset(presets[name]);
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
  return presets;
}

// 从 presets map 中取出 snap 写回表单。ParamsForm.apply 内部已经 dispatch
// 联动事件（size → change、slider/textarea → input），旧代码里手工 dispatch 的
// 步骤全部由它负责。
// denoise 字段不在 ParamsForm 里（旧 wire 不存；新 PRESET_FIELDS 把 denoise_strength
// 加进了白名单），所以加载 preset 时手动写回 denoise 滑块并 dispatch input 触发
// denoiseVal 标签刷新。
function applyPreset(name, presets) {
  const snap = presets[name];
  if (!snap) return;
  ParamsForm.apply(snap);
  const denoise = $("denoise");
  if (denoise && snap.denoise_strength != null) {
    denoise.value = String(snap.denoise_strength);
    denoise.dispatchEvent(new Event("input"));
  }
}

let presets = loadPresets();

$("presetSelect").addEventListener("change", () => {
  const name = $("presetSelect").value;
  if (name) applyPreset(name, presets);
});

$("presetSave").addEventListener("click", async () => {
  const name = await openPromptModal({
    title: t("preset_modal_save_title"),
    defaultValue: "",
    confirmLabel: t("preset_save"),
  });
  if (!name) return;
  // preset wire 形态：snake_case（与 /generate body 对齐），
  // 通过 ParamsPayload.fromForm(..., { presetMode: true }) 输出 PRESET_FIELDS 白名单字段。
  // mode / denoise_strength 显式注入到 snap（不进 ParamsForm）。
  const snap = ParamsForm.read();
  const presetWire = ParamsPayload.fromForm(
    { ...snap, mode, denoise_strength: parseFloat($("denoise").value) },
    { presetMode: true },
  );
  presets[name] = presetWire;
  localStorage.setItem("presets", JSON.stringify(presets));
  const sel = $("presetSelect");
  const opt = document.createElement("option");
  opt.value = name;
  opt.textContent = name;
  sel.appendChild(opt);
  sel.value = name;
});

$("presetDelete").addEventListener("click", async () => {
  const sel = $("presetSelect");
  const name = sel.value;
  if (!name) return;
  const ok = await openPromptModal({
    title: t("preset_modal_delete_title"),
    body: t("preset_modal_delete_body"),
    confirmLabel: t("preset_delete"),
    danger: true,
  });
  if (!ok) return;
  delete presets[name];
  localStorage.setItem("presets", JSON.stringify(presets));
  sel.value = "";
  const opt = sel.querySelector(`option[value="${name.replace(/"/g, '\\"')}"]`);
  if (opt) opt.remove();
});

function switchLanguage(lang) {
  currLang = lang;
  localStorage.setItem("lang", lang);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.childElementCount > 0) return; // skip parents; i18n should target each child
    const key = el.getAttribute("data-i18n");
    if (t(key) !== key) el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-placeholder"));
  });
  document.querySelectorAll("[data-i18n-value]").forEach((el) => {
    el.value = t(el.getAttribute("data-i18n-value"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (t(key) !== key) el.setAttribute("title", t(key));
  });
  const hasImage = typeof imgB64 !== "undefined" && imgB64 !== null;
  const imgLabel = document.getElementById("imgUploadLabel");
  if (imgLabel) imgLabel.textContent = hasImage ? t("upload_change") : t("upload_tap");
  const lToggle = document.getElementById("langToggle");
  if (lToggle) lToggle.textContent = lang === "zh" ? "EN" : "中文";
  const isOrig = document.body.classList.contains("theme-original");
  const tLabel = document.getElementById("themeLabel");
  if (tLabel) tLabel.textContent = isOrig ? t("theme_label_original") : t("theme_label_apple");
  const genLabel = document.getElementById("genLabel");
  if (genLabel && $("genBtn") && $("genBtn").getAttribute("aria-busy") !== "true") {
    genLabel.textContent = t("generate");
  }
}

// ─── AUTOMASK ────────────────────────────────────────────────────────────────
function dilateSegMask(maskImg, padding, sz) {
  const off = document.createElement("canvas");
  off.width = sz;
  off.height = sz;
  const ctx = off.getContext("2d");
  ctx.drawImage(maskImg, 0, 0, sz, sz);
  const raw = ctx.getImageData(0, 0, sz, sz);

  // Binary source
  const src = new Uint8Array(sz * sz);
  for (let i = 0; i < sz * sz; i++) src[i] = raw.data[i * 4] > 128 ? 1 : 0;

  if (padding === 0) {
    const out = ctx.createImageData(sz, sz);
    for (let i = 0; i < sz * sz; i++) {
      const v = src[i] * 255;
      out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
      out.data[i * 4 + 3] = v;
    }
    ctx.putImageData(out, 0, 0);
    return off;
  }

  // Horizontal pass (sliding window max)
  const tmp = new Uint8Array(sz * sz);
  for (let y = 0; y < sz; y++) {
    const row = y * sz;
    let count = 0;
    for (let x = 0; x <= Math.min(padding, sz - 1); x++) count += src[row + x];
    tmp[row] = count > 0 ? 1 : 0;
    for (let x = 1; x < sz; x++) {
      if (x + padding < sz) count += src[row + x + padding];
      if (x - padding - 1 >= 0) count -= src[row + x - padding - 1];
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }

  // Vertical pass (sliding window max)
  const dst = new Uint8Array(sz * sz);
  for (let x = 0; x < sz; x++) {
    let count = 0;
    for (let y = 0; y <= Math.min(padding, sz - 1); y++) count += tmp[y * sz + x];
    dst[x] = count > 0 ? 1 : 0;
    for (let y = 1; y < sz; y++) {
      if (y + padding < sz) count += tmp[(y + padding) * sz + x];
      if (y - padding - 1 >= 0) count -= tmp[(y - padding - 1) * sz + x];
      dst[y * sz + x] = count > 0 ? 1 : 0;
    }
  }

  const out = ctx.createImageData(sz, sz);
  for (let i = 0; i < sz * sz; i++) {
    const v = dst[i] * 255;
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v;
    out.data[i * 4 + 3] = v;
  }
  ctx.putImageData(out, 0, 0);
  return off;
}

function createColorCanvas(dilatedCanvas, color, sz) {
  const off = document.createElement("canvas");
  off.width = sz;
  off.height = sz;
  const ctx = off.getContext("2d");
  ctx.drawImage(dilatedCanvas, 0, 0, sz, sz);
  const d = ctx.getImageData(0, 0, sz, sz);
  const [r, g, b] = color;
  for (let i = 0; i < d.data.length; i += 4) {
    if (d.data[i + 3] > 0) {
      d.data[i] = r;
      d.data[i + 1] = g;
      d.data[i + 2] = b;
      d.data[i + 3] = 175;
    }
  }
  ctx.putImageData(d, 0, 0);
  return off;
}

function rebuildSegCanvases() {
  const sz = getTargetSize();
  for (const seg of automaskSegments) {
    seg.dilated = dilateSegMask(seg.maskImg, automaskPadding, sz);
    seg.colorCanvas = createColorCanvas(seg.dilated, seg.color, sz);
  }
}

function drawAutomaskOverlay() {
  const canvas = $("automaskCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (automaskBaseImg) ctx.drawImage(automaskBaseImg, 0, 0, canvas.width, canvas.height);
  for (const seg of automaskSegments) {
    if (!seg.colorCanvas) continue;
    ctx.globalAlpha = automaskSelected.has(seg.label) ? 1.0 : 0.12;
    ctx.drawImage(seg.colorCanvas, 0, 0, canvas.width, canvas.height);
  }
  ctx.globalAlpha = 1.0;
}

function renderAutomaskChips() {
  const container = $("automaskChips");
  container.innerHTML = "";
  for (const seg of automaskSegments) {
    const [r, g, b] = seg.color;
    const selected = automaskSelected.has(seg.label);
    const chip = document.createElement("button");
    chip.className = "seg-chip" + (selected ? " selected" : "");
    chip.style.borderColor = selected ? `rgb(${r},${g},${b})` : "#333";
    chip.style.color = selected ? `rgb(${r},${g},${b})` : "#666";
    chip.innerHTML = `<span class="seg-dot" style="background:rgb(${r},${g},${b})"></span>${seg.label}`;
    chip.addEventListener("click", () => {
      if (automaskSelected.has(seg.label)) automaskSelected.delete(seg.label);
      else automaskSelected.add(seg.label);
      drawAutomaskOverlay();
      renderAutomaskChips();
    });
    container.appendChild(chip);
  }
}

function openAutomaskModal() {
  const canvas = $("automaskCanvas");
  const sz = getTargetSize();
  canvas.width = sz;
  canvas.height = sz;
  const displaySize = Math.min(window.innerWidth, window.innerHeight - 180, 650);
  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";
  openModal($("automaskModal"));
}

function closeAutomaskModal() {
  closeModal($("automaskModal"));
}

function applyAutomask() {
  const sz = getTargetSize();
  const off = document.createElement("canvas");
  off.width = sz;
  off.height = sz;
  const octx = off.getContext("2d");
  octx.fillStyle = "black";
  octx.fillRect(0, 0, sz, sz);
  for (const seg of automaskSegments) {
    if (!automaskSelected.has(seg.label) || !seg.dilated) continue;
    octx.drawImage(seg.dilated, 0, 0);
  }
  maskB64 = off.toDataURL("image/png").split(",")[1];
  $("maskEnabled").checked = true;
  $("editMaskBtn").classList.remove("hidden");
  updateMaskThumb();
  saveSession();
  closeAutomaskModal();
}

$("automaskPad").addEventListener("input", () => {
  automaskPadding = parseInt($("automaskPad").value);
  $("automaskPadVal").textContent = automaskPadding;
  if (automaskSegments.length > 0) {
    rebuildSegCanvases();
    drawAutomaskOverlay();
  }
});

$("automaskBtn").addEventListener("click", async () => {
  if (!imgB64) return;
  // Cache: reuse last result for same image
  if (imgB64 === automaskLastImgB64 && automaskSegments.length > 0) {
    openAutomaskModal();
    drawAutomaskOverlay();
    renderAutomaskChips();
    return;
  }
  const token = $("hfToken").value.trim();
  const btn = $("automaskBtn");
  btn.disabled = true;
  btn.textContent = t("automask_segmenting");
  hideError();
  openAutomaskModal();
  $("automaskSpinner").style.display = "";
  $("automaskChips").innerHTML = "";
  automaskBaseImg = new Image();
  automaskBaseImg.onload = () => drawAutomaskOverlay();
  automaskBaseImg.src = "data:image/png;base64," + imgB64;
  try {
    const res = await fetch("/automask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imgB64, token }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(t("error_automask") + ": " + (data.error || res.status));
      closeAutomaskModal();
      return;
    }
    const segments = data.filter((s) => s.label !== "Background");
    const sz = getTargetSize();
    await Promise.all(
      segments.map(
        (seg) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              seg.maskImg = img;
              seg.color = SEG_COLORS[seg.label] || [0, 220, 0];
              seg.dilated = dilateSegMask(img, automaskPadding, sz);
              seg.colorCanvas = createColorCanvas(seg.dilated, seg.color, sz);
              resolve();
            };
            img.src = "data:image/png;base64," + seg.mask;
          }),
      ),
    );
    automaskSegments = segments;
    automaskLastImgB64 = imgB64;
    automaskSelected = new Set(
      segments.filter((s) => CLOTH_LABELS.has(s.label)).map((s) => s.label),
    );
    drawAutomaskOverlay();
    renderAutomaskChips();
  } catch (e) {
    showError(t("error_automask") + ": " + e.message);
    closeAutomaskModal();
  } finally {
    $("automaskSpinner").style.display = "none";
    btn.disabled = false;
    btn.textContent = t("automask");
  }
});

$("automaskCancel").addEventListener("click", closeAutomaskModal);
$("automaskApply").addEventListener("click", applyAutomask);

restoreSession();

// Language toggle
document.getElementById("langToggle").addEventListener("click", () => {
  switchLanguage(currLang === "zh" ? "en" : "zh");
});

// Theme toggle
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "original") document.body.classList.add("theme-original");
function refreshThemeUI() {
  const isOrig = document.body.classList.contains("theme-original");
  renderIcon(document.getElementById("themeIcon"), isOrig ? "moon" : "sun");
  const lbl = document.getElementById("themeLabel");
  if (lbl) lbl.textContent = isOrig ? t("theme_label_original") : t("theme_label_apple");
}
refreshThemeUI();
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("theme-original");
  const isOrig = document.body.classList.contains("theme-original");
  localStorage.setItem("theme", isOrig ? "original" : "apple");
  refreshThemeUI();
});

// Initialize language
switchLanguage(currLang);
