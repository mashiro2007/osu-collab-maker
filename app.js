(() => {
  'use strict';

  const PAD_W = 840;
  const PAD_H = 350;
  const PAD_ASPECT = PAD_W / PAD_H;
  const MAX_SIGNATURES = 12;
  const MAX_EXPORT_PIXELS = 90e6;
  const MAX_EXPORT_SIDE = 16000;
  const NEW_SIGNATURE_POSITIONS = [
    [0.78, 0.84], [0.22, 0.84], [0.78, 0.18],
    [0.22, 0.18], [0.5, 0.84], [0.5, 0.18],
    [0.78, 0.5], [0.22, 0.5], [0.5, 0.5]
  ];

  let sigSeq = 0;

  const FONTS = [
    { id: 'xingkai', label: '行楷 · 签名感', stack: '"STXingkai","华文行楷","Xingkai SC","KaiTi","楷体",cursive' },
    { id: 'kaiti', label: '楷体 · 端正', stack: '"KaiTi","楷体","Kaiti SC","STKaiti",serif' },
    { id: 'lishu', label: '隶书 · 古朴', stack: '"LiSu","隶书","STLiti",serif' },
    { id: 'yahei', label: '黑体 · 现代', stack: '"Microsoft YaHei","微软雅黑","PingFang SC","Hiragino Sans GB",sans-serif' },
    { id: 'songti', label: '宋体 · 经典', stack: '"SimSun","宋体","Songti SC",serif' },
    { id: 'youyuan', label: '幼圆 · 轻松', stack: '"YouYuan","幼圆","Yuanti SC",sans-serif' },
    { id: 'script', label: '英文手写', stack: '"Segoe Script","Brush Script MT","Snell Roundhand",cursive' }
  ];

  const PRESETS = {
    ink: { fontId: 'xingkai', text: { color: '#ffffff', strokeOn: true, strokeColor: '#101010', strokeWidth: 0.035, shadowOn: true, plateOn: false } },
    black: { fontId: 'xingkai', text: { color: '#171310', strokeOn: false, strokeColor: '#101010', strokeWidth: 0.03, shadowOn: false, plateOn: false } },
    gold: { fontId: 'xingkai', text: { color: '#f2d79f', strokeOn: true, strokeColor: '#4a3410', strokeWidth: 0.022, shadowOn: true, plateOn: false } },
    minimal: { fontId: 'kaiti', text: { color: '#ffffff', strokeOn: false, strokeColor: '#101010', strokeWidth: 0.02, shadowOn: true, plateOn: false, spacing: 0.06 } }
  };

  const FORMATS = {
    png: { mime: 'image/png', ext: '.png', label: 'PNG' },
    jpeg: { mime: 'image/jpeg', ext: '.jpg', label: 'JPG' },
    webp: { mime: 'image/webp', ext: '.webp', label: 'WebP' }
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const state = {
    image: null,
    imageW: 0,
    imageH: 0,
    imageName: '',
    imageBytes: 0,
    sampleCanvas: null,
    sampleCtx: null,
    sig: null,
    signatures: [],
    activeId: null,
    bboxes: new Map(),
    customFonts: [],
    fontSeq: 0,
    activePos: '',
    compare: false,
    pickColor: false,
    drag: null,
    exporting: false,
    format: 'png',
    scale: 1,
    quality: 0.92,
    raf: 0,
    renderPending: false,
    uiScale: 1,
    lastBBox: null,
    padStroke: null,
    padRaf: 0,
    textTouched: false
  };

  const el = {};
  [
    'stage', 'stageCanvas', 'emptyState', 'stageTopline', 'stageBadge', 'btnCompare', 'stageFooter',
    'fileInfo', 'fileThumb', 'fileName', 'fileDims', 'btnReplace',
    'sigList', 'btnAddSig',
    'typeTabs', 'signText', 'textCount', 'fontSelect', 'btnFont', 'fontFile', 'presetRow',
    'swatches', 'textColor', 'colorHex', 'btnEyedropper', 'spacingRange', 'spacingVal',
    'boldBtn', 'italicBtn', 'strokeOn', 'strokeControls', 'strokeColor', 'strokeWidth', 'strokeWidthVal',
    'shadowOn', 'plateOn', 'plateControls', 'plateColor', 'plateOpacity', 'plateOpacityVal',
    'moreToggle', 'moreStyles',
    'padCanvas', 'padPlaceholder', 'btnPadUndo', 'btnPadClear', 'padCount', 'penColor', 'penWidth', 'penWidthVal',
    'btnSigImage', 'sigImageFile', 'sigImageCard', 'sigThumb', 'sigImgName', 'sigImgSize', 'btnSigImageClear',
    'whiteCut', 'whiteField', 'whiteStrength', 'whiteVal',
    'posGrid', 'btnResetPos', 'posX', 'posXVal', 'posY', 'posYVal',
    'sizeRange', 'sizeVal', 'rotRange', 'rotVal', 'opacityRange', 'opacityVal',
    'formatTabs', 'scaleChips', 'qualityField', 'quality', 'qualityVal',
    'exportName', 'extLabel', 'exportDimHint', 'exportNote', 'btnExport', 'btnExportTop',
    'btnImport', 'btnPick', 'fileInput', 'toast'
  ].forEach((id) => { el[id] = document.getElementById(id); });

  const previewCtx = el.stageCanvas.getContext('2d');
  const padCtx = el.padCanvas.getContext('2d');
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 8;
  measureCanvas.height = 8;
  const measureCtx = measureCanvas.getContext('2d');

  let toastTimer = 0;
  let whiteTimer = 0;
  let fitRaf = 0;

  /* ============================== 基础工具 ============================== */

  function createSignature(content = '你的签名') {
    return {
      id: `sig-${++sigSeq}`,
      label: content,
      type: 'text',
      visible: true,
      presetId: 'ink',
      cx: 0.8,
      cy: 0.86,
      size: 0.085,
      rotation: 0,
      opacity: 1,
      text: {
        content,
        fontId: 'xingkai',
        fontStack: FONTS[0].stack,
        color: '#ffffff',
        bold: false,
        italic: false,
        spacing: 0.02,
        strokeOn: true,
        strokeColor: '#111111',
        strokeWidth: 0.035,
        shadowOn: true,
        plateOn: false,
        plateColor: '#000000',
        plateOpacity: 0.4
      },
      draw: { strokes: [], color: '#ffffff', width: 8 },
      image: { source: null, canvas: null, aspect: 1, name: '', whiteCut: false, tolerance: 55 }
    };
  }

  function signatureById(id) {
    return state.signatures.find((sig) => sig.id === id) || null;
  }

  function signatureLabel(sig) {
    const label = (sig.label || '').trim();
    if (label) return label;
    if (sig.type === 'text') return sig.text.content.trim() || '未命名签名';
    if (sig.type === 'draw') return '手写签名';
    if (sig.type === 'image') return '图片签名';
    return '签名';
  }

  function signatureKind(sig) {
    return sig.type === 'text' ? '文字' : sig.type === 'draw' ? '手写' : '图片';
  }

  function signatureDotColor(sig) {
    if (sig.type === 'draw') return sig.draw.color || '#ffffff';
    if (sig.type === 'text') return sig.text.color || '#ffffff';
    return '#d8c39a';
  }

  function toast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('is-error', Boolean(isError));
    el.toast.classList.add('is-show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.toast.classList.remove('is-show'), 2800);
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function hexToRgb(hex) {
    let h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) h = '000000';
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function allFonts() {
    return FONTS.concat(state.customFonts);
  }

  function findFont(id) {
    return allFonts().find((f) => f.id === id) || FONTS[0];
  }

  function hasSignatureContent() {
    const s = state.sig;
    if (!s.visible) return false;
    if (s.type === 'text') return Boolean(s.text.content.trim());
    if (s.type === 'draw') return s.draw.strokes.length > 0;
    if (s.type === 'image') return Boolean(s.image.canvas);
    return false;
  }

  /* ============================== 多签名管理 ============================== */

  function updateSigList() {
    if (!el.sigList) return;
    const scrollTop = el.sigList.scrollTop;
    const fragment = document.createDocumentFragment();
    state.signatures.forEach((sig, index) => {
      const row = document.createElement('div');
      row.className = `sig-row${sig.id === state.activeId ? ' is-active' : ''}`;
      row.dataset.id = sig.id;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-pressed', String(sig.id === state.activeId));
      row.title = `${signatureLabel(sig)} · ${signatureKind(sig)}`;

      const num = document.createElement('span');
      num.className = 'sig-index';
      num.textContent = String(index + 1).padStart(2, '0');

      const dot = document.createElement('span');
      dot.className = 'sig-color';
      dot.style.background = signatureDotColor(sig);

      const name = document.createElement('span');
      name.className = 'sig-name';
      name.textContent = signatureLabel(sig);

      const kind = document.createElement('span');
      kind.className = 'sig-kind';
      kind.textContent = signatureKind(sig);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sig-del';
      del.dataset.del = sig.id;
      del.textContent = '×';
      del.title = state.signatures.length > 1 ? '删除此签名' : '至少保留一个签名';
      del.disabled = state.signatures.length <= 1;

      row.append(num, dot, name, kind, del);
      fragment.appendChild(row);
    });
    el.sigList.replaceChildren(fragment);
    el.sigList.scrollTop = scrollTop;
    el.btnAddSig.disabled = state.signatures.length >= MAX_SIGNATURES;
    el.btnAddSig.title = el.btnAddSig.disabled
      ? `最多支持 ${MAX_SIGNATURES} 个签名`
      : '为照片中的另一位人物添加签名';
  }

  function scrollActiveRowIntoView() {
    const row = el.sigList.querySelector('.sig-row.is-active');
    if (!row) return;
    const listRect = el.sigList.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    if (rowRect.top < listRect.top) el.sigList.scrollTop -= listRect.top - rowRect.top;
    else if (rowRect.bottom > listRect.bottom) el.sigList.scrollTop += rowRect.bottom - listRect.bottom;
  }

  function selectSignature(id, options = {}) {
    const sig = signatureById(id);
    if (!sig) return;
    if (sig === state.sig && !options.force) {
      updateSigList();
      if (options.focusText && sig.type === 'text') {
        el.signText.focus();
        el.signText.select();
      }
      return;
    }
    state.activeId = sig.id;
    state.sig = sig;
    state.drag = null;
    state.padStroke = null;
    state.activePos = '';
    window.clearTimeout(whiteTimer);

    syncTypeUI();
    syncTextUI(true);
    syncPlacementUI();
    syncDrawUI();
    updatePadUI();
    repaintPad();
    updateSigImageUI();
    updateSigList();
    requestRender();
    scrollActiveRowIntoView();

    if (options.focusText && sig.type === 'text') {
      requestAnimationFrame(() => {
        el.signText.focus();
        el.signText.select();
      });
    }
  }

  function addSignature() {
    if (state.signatures.length >= MAX_SIGNATURES) {
      toast(`最多支持 ${MAX_SIGNATURES} 个签名`, true);
      return;
    }
    const template = state.sig;
    const number = state.signatures.length + 1;
    const sig = createSignature(`签名 ${number}`);
    const position = NEW_SIGNATURE_POSITIONS[(number - 1) % NEW_SIGNATURE_POSITIONS.length];
    const lap = Math.floor((number - 1) / NEW_SIGNATURE_POSITIONS.length);
    const nudge = Math.min(0.12, lap * 0.03);
    sig.cx = clamp(position[0] + (position[0] > 0.5 ? -nudge : nudge), 0.03, 0.97);
    sig.cy = clamp(position[1] + (position[1] > 0.5 ? -nudge : nudge), 0.03, 0.97);

    // 沿用当前文字签名的样式，避免每个人都要重新调一遍
    if (template && template.type === 'text') {
      sig.text = { ...template.text, content: `签名 ${number}` };
      sig.presetId = template.presetId;
      sig.size = template.size;
      sig.rotation = template.rotation;
      sig.opacity = template.opacity;
    }

    state.signatures.push(sig);
    selectSignature(sig.id, { focusText: true });
    toast(`已添加第 ${number} 个签名，输入这位人物的名字`);
  }

  function removeSignature(id) {
    if (state.signatures.length <= 1) {
      toast('至少保留一个签名');
      return;
    }
    const index = state.signatures.findIndex((sig) => sig.id === id);
    if (index < 0) return;
    const [removed] = state.signatures.splice(index, 1);
    if (
      removed.image.source &&
      typeof removed.image.source.close === 'function' &&
      !state.signatures.some((sig) => sig.image.source === removed.image.source)
    ) {
      try { removed.image.source.close(); } catch (error) { /* ignore */ }
    }
    if (state.activeId === id) {
      const next = state.signatures[Math.min(index, state.signatures.length - 1)];
      state.sig = null;
      selectSignature(next.id);
    } else {
      updateSigList();
      requestRender();
    }
    toast('已删除这个签名');
  }

  /* ============================== 字体 ============================== */

  function buildFontSelect() {
    const current = state.sig.text.fontId;
    el.fontSelect.innerHTML = '';
    allFonts().forEach((font) => {
      const option = document.createElement('option');
      option.value = font.id;
      option.textContent = font.label;
      el.fontSelect.appendChild(option);
    });
    if (allFonts().some((f) => f.id === current)) el.fontSelect.value = current;
    else el.fontSelect.value = FONTS[0].id;
  }

  function applyFont(id) {
    const font = findFont(id);
    state.sig.text.fontId = font.id;
    state.sig.text.fontStack = font.stack;
    el.fontSelect.value = font.id;
    clearPreset();
    requestRender();
  }

  async function loadFontFile(file) {
    if (!file) return;
    if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) {
      toast('请选择 TTF / OTF / WOFF 字体文件', true);
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const family = `SigFont${++state.fontSeq}`;
      const face = new FontFace(family, buffer);
      await face.load();
      document.fonts.add(face);
      const label = file.name.replace(/\.[^.]+$/, '');
      const id = `custom-${state.fontSeq}`;
      state.customFonts.push({ id, label: `${label} · 自定义`, stack: `"${family}"` });
      buildFontSelect();
      el.fontSelect.value = id;
      applyFont(id);
      toast(`字体已加载：${label}`);
    } catch (error) {
      console.error(error);
      toast('字体加载失败，换一个文件试试', true);
    }
  }

  /* ============================== 测量与绘制 ============================== */

  function applyFontToCtx(ctx, textStyle, fontPx) {
    ctx.font = `${textStyle.italic ? 'italic ' : ''}${textStyle.bold ? '700' : '400'} ${fontPx}px ${textStyle.fontStack}`;
    try {
      ctx.letterSpacing = `${textStyle.spacing * fontPx}px`;
    } catch (error) {
      /* 旧版浏览器不支持 letterSpacing，忽略即可 */
    }
  }

  function textLayout(ctx, sig, H) {
    const t = sig.text;
    const content = String(t.content || '').replace(/\r/g, '');
    if (!content.trim()) return null;
    const lines = content.split('\n').slice(0, 6);
    while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const n = lines.length;
    const fontPx = (sig.size * H) / (0.92 + (n - 1) * 1.16);
    applyFontToCtx(ctx, t, fontPx);
    const widths = lines.map((line) => ctx.measureText(line).width);
    const w = Math.max(fontPx * 0.55, ...widths);
    const lineH = fontPx * 1.16;
    const h = fontPx * 0.92 + (n - 1) * lineH;
    return { lines, fontPx, lineH, w, h };
  }

  function drawLayoutMeasure(sig, H) {
    const strokes = sig.draw.strokes;
    if (!strokes.length) return null;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const stroke of strokes) {
      const halfY = stroke.width / 2;
      const halfX = halfY / PAD_ASPECT;
      for (const point of stroke.points) {
        if (point.x - halfX < x0) x0 = point.x - halfX;
        if (point.y - halfY < y0) y0 = point.y - halfY;
        if (point.x + halfX > x1) x1 = point.x + halfX;
        if (point.y + halfY > y1) y1 = point.y + halfY;
      }
    }
    if (!Number.isFinite(x0)) return null;
    const bw = Math.max(0.002, x1 - x0);
    const bh = Math.max(0.002, y1 - y0);
    const aspect = (bw * PAD_W) / (bh * PAD_H);
    const h = sig.size * H;
    return { x0, y0, bw, bh, aspect, w: h * aspect, h };
  }

  function imageLayout(sig, H) {
    const canvas = sig.image.canvas;
    if (!canvas) return null;
    const h = sig.size * H;
    return { w: h * (canvas.width / canvas.height), h, canvas };
  }

  function measureSignature(ctx, sig, W, H) {
    if (!sig.visible) return null;
    if (sig.type === 'text') {
      const layout = textLayout(ctx, sig, H);
      return layout ? { kind: 'text', w: layout.w, h: layout.h, layout } : null;
    }
    if (sig.type === 'draw') {
      const layout = drawLayoutMeasure(sig, H);
      return layout ? { kind: 'draw', w: layout.w, h: layout.h, layout } : null;
    }
    if (sig.type === 'image') {
      const layout = imageLayout(sig, H);
      return layout ? { kind: 'image', w: layout.w, h: layout.h, layout } : null;
    }
    return null;
  }

  function paintText(ctx, sig, layout, W, H) {
    const t = sig.text;
    const { lines, fontPx, lineH, w, h } = layout;
    ctx.save();
    ctx.translate(sig.cx * W, sig.cy * H);
    ctx.rotate((sig.rotation * Math.PI) / 180);
    ctx.globalAlpha *= sig.opacity;
    applyFontToCtx(ctx, t, fontPx);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    if (t.plateOn) {
      const padX = fontPx * 0.44;
      const padY = fontPx * 0.3;
      const radius = fontPx * 0.3;
      ctx.fillStyle = rgba(t.plateColor, t.plateOpacity);
      roundRectPath(ctx, -w / 2 - padX, -h / 2 - padY, w + padX * 2, h + padY * 2, radius);
      ctx.fill();
    }

    const baseTop = -h / 2 + fontPx * 0.74;

    if (t.shadowOn) {
      ctx.save();
      ctx.fillStyle = t.color;
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = fontPx * 0.2;
      ctx.shadowOffsetX = fontPx * 0.02;
      ctx.shadowOffsetY = fontPx * 0.055;
      for (let i = 0; i < lines.length; i += 1) {
        ctx.fillText(lines[i], 0, baseTop + i * lineH);
      }
      ctx.restore();
    }

    if (t.strokeOn && t.strokeWidth > 0) {
      ctx.strokeStyle = t.strokeColor;
      ctx.lineWidth = Math.max(0.6, t.strokeWidth * fontPx);
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
    }
    ctx.fillStyle = t.color;
    for (let i = 0; i < lines.length; i += 1) {
      const y = baseTop + i * lineH;
      if (t.strokeOn && t.strokeWidth > 0) ctx.strokeText(lines[i], 0, y);
      ctx.fillText(lines[i], 0, y);
    }
    ctx.restore();
  }

  function traceStroke(ctx, points, toX, toY) {
    if (!points.length) return;
    if (points.length === 1) {
      const x = toX(points[0]);
      const y = toY(points[0]);
      ctx.beginPath();
      ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(toX(points[0]), toY(points[0]));
    for (let i = 1; i < points.length - 1; i += 1) {
      const cx1 = toX(points[i]);
      const cy1 = toY(points[i]);
      const mx = (toX(points[i]) + toX(points[i + 1])) / 2;
      const my = (toY(points[i]) + toY(points[i + 1])) / 2;
      ctx.quadraticCurveTo(cx1, cy1, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(toX(last), toY(last));
    ctx.stroke();
  }

  function paintDraw(ctx, sig, layout, W, H) {
    const k = layout.h / (layout.bh * PAD_H);
    const offsetX = (layout.x0 + layout.bw / 2) * PAD_W;
    const offsetY = (layout.y0 + layout.bh / 2) * PAD_H;
    const toX = (p) => (p.x * PAD_W - offsetX) * k;
    const toY = (p) => (p.y * PAD_H - offsetY) * k;

    ctx.save();
    ctx.translate(sig.cx * W, sig.cy * H);
    ctx.rotate((sig.rotation * Math.PI) / 180);
    ctx.globalAlpha *= sig.opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.32)';
    ctx.shadowBlur = Math.max(1, layout.h * 0.018);
    ctx.shadowOffsetY = Math.max(0.5, layout.h * 0.006);
    for (const stroke of sig.draw.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = Math.max(0.6, stroke.width * PAD_H * k);
      traceStroke(ctx, stroke.points, toX, toY);
    }
    ctx.restore();
  }

  function paintImage(ctx, sig, layout, W, H) {
    ctx.save();
    ctx.translate(sig.cx * W, sig.cy * H);
    ctx.rotate((sig.rotation * Math.PI) / 180);
    ctx.globalAlpha *= sig.opacity;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(layout.canvas, -layout.w / 2, -layout.h / 2, layout.w, layout.h);
    ctx.restore();
  }

  function paintSignature(ctx, sig, measured, W, H) {
    if (measured.kind === 'text') paintText(ctx, sig, measured.layout, W, H);
    else if (measured.kind === 'draw') paintDraw(ctx, sig, measured.layout, W, H);
    else if (measured.kind === 'image') paintImage(ctx, sig, measured.layout, W, H);
  }

  function paintAllSignatures(ctx, W, H) {
    const boxes = new Map();
    for (const sig of state.signatures) {
      if (!sig.visible) continue;
      const measured = measureSignature(ctx, sig, W, H);
      if (!measured) continue;
      paintSignature(ctx, sig, measured, W, H);
      boxes.set(sig.id, {
        cx: sig.cx * W,
        cy: sig.cy * H,
        w: measured.w,
        h: measured.h,
        rot: (sig.rotation * Math.PI) / 180
      });
    }
    return boxes;
  }

  function drawScene(ctx, W, H, opaque) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (opaque) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (state.image) {
      ctx.drawImage(state.image, 0, 0, W, H);
      paintAllSignatures(ctx, W, H);
    }
    ctx.restore();
  }

  /* ============================== 预览 ============================== */

  function requestRender() {
    if (!state.image || state.renderPending) return;
    state.renderPending = true;
    requestAnimationFrame(() => {
      state.renderPending = false;
      renderPreview();
    });
  }

  function renderPreview() {
    if (!state.image) return;
    const W = el.stageCanvas.width;
    const H = el.stageCanvas.height;
    if (!W || !H) return;
    const ctx = previewCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.image, 0, 0, W, H);

    state.bboxes = new Map();
    state.lastBBox = null;
    if (!state.compare) {
      state.bboxes = paintAllSignatures(ctx, W, H);
      state.lastBBox = state.bboxes.get(state.activeId) || null;
      drawOtherGuides(ctx);
      if (state.lastBBox) drawSelection(ctx, state.lastBBox);
    }
    ctx.restore();
  }

  function drawOtherGuides(ctx) {
    if (state.signatures.length < 2) return;
    const k = state.uiScale || 1;
    state.signatures.forEach((sig, index) => {
      if (sig.id === state.activeId) return;
      const box = state.bboxes.get(sig.id);
      if (!box) return;
      ctx.save();
      ctx.translate(box.cx, box.cy);
      ctx.rotate(box.rot);
      ctx.strokeStyle = 'rgba(255,102,170,0.32)';
      ctx.lineWidth = 1 * k;
      ctx.setLineDash([3 * k, 5 * k]);
      ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
      ctx.setLineDash([]);

      const bx = -box.w / 2 - 10 * k;
      const by = -box.h / 2 - 10 * k;
      const radius = 8 * k;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(26,20,23,0.88)';
      ctx.fill();
      ctx.lineWidth = 1.1 * k;
      ctx.strokeStyle = 'rgba(255,102,170,0.58)';
      ctx.stroke();
      ctx.fillStyle = '#ffb1d4';
      ctx.font = `500 ${9.5 * k}px "Segoe UI", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), bx, by + 0.5 * k);
      ctx.restore();
    });
  }

  function drawSelection(ctx, box) {
    const k = state.uiScale || 1;
    const hx = box.w / 2;
    const hy = box.h / 2;
    const handleR = 5.2 * k;

    ctx.save();
    ctx.translate(box.cx, box.cy);
    ctx.rotate(box.rot);

    ctx.lineWidth = 1.4 * k;
    ctx.strokeStyle = 'rgba(255,102,170,0.95)';
    ctx.setLineDash([5 * k, 4 * k]);
    ctx.strokeRect(-hx, -hy, box.w, box.h);
    ctx.setLineDash([]);

    const corners = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
    for (const [x, y] of corners) {
      ctx.beginPath();
      ctx.arc(x, y, handleR, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1.6 * k;
      ctx.strokeStyle = '#ff4f9a';
      ctx.stroke();
    }

    const rotateY = -hy - 26 * k;
    ctx.beginPath();
    ctx.moveTo(0, -hy);
    ctx.lineTo(0, rotateY + handleR + 1.5 * k);
    ctx.lineWidth = 1.2 * k;
    ctx.strokeStyle = 'rgba(255,102,170,0.8)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, rotateY, handleR + 1.2 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#ff66aa';
    ctx.fill();
    ctx.lineWidth = 1.6 * k;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.restore();
  }

  function fitCanvas() {
    if (!state.image) return;
    const stage = el.stage;
    const style = getComputedStyle(stage);
    const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    const availW = Math.max(80, stage.clientWidth - padX);
    const availH = Math.max(80, stage.clientHeight - padY);
    if (!availW || !availH) return;

    const fit = Math.min(availW / state.imageW, availH / state.imageH);
    const cssW = Math.max(48, Math.floor(state.imageW * fit));
    const cssH = Math.max(48, Math.floor(state.imageH * fit));

    el.stageCanvas.style.width = `${cssW}px`;
    el.stageCanvas.style.height = `${cssH}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const maxDim = 2200;
    const resolution = Math.min(dpr, maxDim / Math.max(cssW, cssH));
    el.stageCanvas.width = Math.max(2, Math.round(cssW * resolution));
    el.stageCanvas.height = Math.max(2, Math.round(cssH * resolution));
    state.uiScale = el.stageCanvas.width / cssW;
    renderPreview();
  }

  /* ============================== 画布交互 ============================== */

  function canvasPoint(event) {
    const rect = el.stageCanvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (el.stageCanvas.width / rect.width),
      y: (event.clientY - rect.top) * (el.stageCanvas.height / rect.height)
    };
  }

  function hitTestBox(box, px, py) {
    if (!box) return '';
    const dx = px - box.cx;
    const dy = py - box.cy;
    const cos = Math.cos(-box.rot);
    const sin = Math.sin(-box.rot);
    const x = dx * cos - dy * sin;
    const y = dx * sin + dy * cos;
    const k = state.uiScale || 1;
    const hx = box.w / 2;
    const hy = box.h / 2;
    const rotateY = -hy - 26 * k;

    if (Math.hypot(x, y - rotateY) <= 16 * k) return 'rotate';
    if (Math.hypot(Math.abs(x) - hx, Math.abs(y) - hy) <= 15 * k) return 'resize';
    if (Math.abs(x) <= hx + 3 * k && Math.abs(y) <= hy + 3 * k) return 'move';
    return '';
  }

  function findHit(px, py) {
    for (let i = state.signatures.length - 1; i >= 0; i -= 1) {
      const sig = state.signatures[i];
      const box = state.bboxes.get(sig.id);
      if (!box) continue;
      const mode = hitTestBox(box, px, py);
      if (!mode) continue;
      if (sig.id !== state.activeId && mode !== 'move') continue;
      return { sig, box, mode };
    }
    return null;
  }

  function updateCursor(event) {
    if (state.pickColor) {
      el.stageCanvas.style.cursor = 'crosshair';
      return;
    }
    const p = canvasPoint(event);
    const hit = findHit(p.x, p.y);
    if (!hit) {
      el.stageCanvas.style.cursor = 'default';
      return;
    }
    if (hit.sig.id !== state.activeId) {
      el.stageCanvas.style.cursor = 'pointer';
      return;
    }
    if (hit.mode === 'move') el.stageCanvas.style.cursor = 'move';
    else if (hit.mode === 'rotate') el.stageCanvas.style.cursor = 'grab';
    else if (hit.mode === 'resize') el.stageCanvas.style.cursor = 'nwse-resize';
    else el.stageCanvas.style.cursor = 'default';
  }

  function onPointerDown(event) {
    if (!state.image) return;
    if (state.pickColor) {
      const p = canvasPoint(event);
      pickColorAt(p);
      return;
    }
    const p = canvasPoint(event);
    const hit = findHit(p.x, p.y);
    if (!hit) return;
    event.preventDefault();
    if (hit.sig.id !== state.activeId) selectSignature(hit.sig.id);
    const sig = hit.sig;
    const box = hit.box;
    state.drag = {
      mode: hit.mode,
      pointerId: event.pointerId,
      startX: p.x,
      startY: p.y,
      startCx: sig.cx,
      startCy: sig.cy,
      startSize: sig.size,
      startRotation: sig.rotation,
      centerX: box.cx,
      centerY: box.cy,
      startDist: Math.hypot(p.x - box.cx, p.y - box.cy) || 1,
      startAngle: Math.atan2(p.y - box.cy, p.x - box.cx)
    };
    try { el.stageCanvas.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    el.stageCanvas.style.cursor = hit.mode === 'move' ? 'grabbing' : hit.mode === 'rotate' ? 'grabbing' : 'nwse-resize';
  }

  function onPointerMove(event) {
    if (!state.drag) {
      updateCursor(event);
      return;
    }
    if (event.pointerId !== state.drag.pointerId) return;
    const p = canvasPoint(event);
    const drag = state.drag;
    const sig = state.sig;
    const W = el.stageCanvas.width;
    const H = el.stageCanvas.height;

    if (drag.mode === 'move') {
      sig.cx = clamp(drag.startCx + (p.x - drag.startX) / W, 0, 1);
      sig.cy = clamp(drag.startCy + (p.y - drag.startY) / H, 0, 1);
    } else if (drag.mode === 'resize') {
      const distance = Math.hypot(p.x - drag.centerX, p.y - drag.centerY);
      const factor = distance / drag.startDist;
      sig.size = clamp(drag.startSize * factor, 0.015, 0.6);
    } else if (drag.mode === 'rotate') {
      const angle = Math.atan2(p.y - drag.centerY, p.x - drag.centerX);
      let degrees = drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI;
      if (event.shiftKey) degrees = Math.round(degrees / 15) * 15;
      sig.rotation = clamp(degrees, -45, 45);
    }
    state.activePos = '';
    syncPlacementUI();
    requestRender();
  }

  function endDrag(event) {
    if (!state.drag) return;
    if (event && event.pointerId !== state.drag.pointerId) return;
    state.drag = null;
    try { el.stageCanvas.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    syncPlacementUI();
    requestRender();
    if (event) updateCursor(event);
  }

  function onWheel(event) {
    if (!state.image || state.compare) return;
    const p = canvasPoint(event);
    const hit = findHit(p.x, p.y);
    if (!hit) return;
    event.preventDefault();
    if (hit.sig.id !== state.activeId) selectSignature(hit.sig.id);
    const delta = event.deltaY || 0;
    state.sig.size = clamp(state.sig.size * (1 - delta * 0.0012), 0.015, 0.6);
    state.activePos = '';
    syncPlacementUI();
    requestRender();
  }

  function pickColorAt(p) {
    if (!state.sampleCanvas) return;
    const sw = state.sampleCanvas.width;
    const sh = state.sampleCanvas.height;
    const x = clamp(Math.floor((p.x / el.stageCanvas.width) * sw), 0, sw - 1);
    const y = clamp(Math.floor((p.y / el.stageCanvas.height) * sh), 0, sh - 1);
    try {
      const data = state.sampleCtx.getImageData(x, y, 1, 1).data;
      if (data[3] === 0) {
        toast('这里没有可吸取的颜色', true);
        return;
      }
      const hex = rgbToHex(data[0], data[1], data[2]);
      setTextColor(hex);
      stopEyedropper();
      toast(`已吸取颜色 ${hex.toUpperCase()}`);
    } catch (error) {
      toast('取色失败', true);
    }
  }

  function startEyedropper() {
    if (!state.image) {
      toast('请先导入一张照片');
      return;
    }
    state.pickColor = true;
    el.btnEyedropper.classList.add('is-active');
    el.stageCanvas.classList.add('is-picking');
    toast('点击照片上的任意位置取色');
  }

  function stopEyedropper() {
    state.pickColor = false;
    el.btnEyedropper.classList.remove('is-active');
    el.stageCanvas.classList.remove('is-picking');
  }

  /* ============================== 位置与 UI 同步 ============================== */

  function syncPlacementUI(options = {}) {
    const sig = state.sig;
    el.posX.value = String(Math.round(sig.cx * 1000) / 10);
    el.posY.value = String(Math.round(sig.cy * 1000) / 10);
    el.posXVal.textContent = `${Math.round(sig.cx * 100)}%`;
    el.posYVal.textContent = `${Math.round(sig.cy * 100)}%`;
    el.sizeRange.value = String(Math.round(sig.size * 1000) / 10);
    el.sizeVal.textContent = `${(sig.size * 100).toFixed(1)}%`;
    el.rotRange.value = String(Math.round(sig.rotation));
    el.rotVal.textContent = `${Math.round(sig.rotation)}°`;
    el.opacityRange.value = String(Math.round(sig.opacity * 100));
    el.opacityVal.textContent = `${Math.round(sig.opacity * 100)}%`;
    if (!options.keepActive) state.activePos = '';
    $$('#posGrid button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.pos === state.activePos);
    });
  }

  function placeSignature(position) {
    if (!state.image) return;
    const measured = measureSignature(measureCtx, state.sig, state.imageW, state.imageH);
    const angle = (state.sig.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const wRatio = measured ? (measured.w * cos + measured.h * sin) / state.imageW : 0.2;
    const hRatio = measured ? (measured.w * sin + measured.h * cos) / state.imageH : 0.1;
    const marginX = 0.055;
    const marginY = 0.055;
    const xs = { l: marginX + wRatio / 2, c: 0.5, r: 1 - marginX - wRatio / 2 };
    const ys = { t: marginY + hRatio / 2, m: 0.5, b: 1 - marginY - hRatio / 2 };
    const vertical = position[0];
    const horizontal = position[1];
    state.sig.cx = clamp(xs[horizontal] !== undefined ? xs[horizontal] : 0.5, 0.02, 0.98);
    state.sig.cy = clamp(ys[vertical] !== undefined ? ys[vertical] : 0.5, 0.02, 0.98);
    state.activePos = position;
    syncPlacementUI({ keepActive: true });
    requestRender();
  }

  function syncTextUI(force = false) {
    const t = state.sig.text;
    if ((force || document.activeElement !== el.signText) && el.signText.value !== t.content) {
      el.signText.value = t.content;
    }
    el.textCount.textContent = `${t.content.length} / 40`;
    el.fontSelect.value = t.fontId;
    el.textColor.value = t.color;
    el.colorHex.textContent = t.color.toUpperCase();
    el.spacingRange.value = String(Math.round(t.spacing * 100));
    el.spacingVal.textContent = String(Math.round(t.spacing * 100));
    el.boldBtn.classList.toggle('is-active', t.bold);
    el.boldBtn.setAttribute('aria-pressed', String(t.bold));
    el.italicBtn.classList.toggle('is-active', t.italic);
    el.italicBtn.setAttribute('aria-pressed', String(t.italic));
    el.strokeOn.checked = t.strokeOn;
    el.strokeControls.hidden = !t.strokeOn;
    el.strokeColor.value = t.strokeColor;
    const strokeValue = Math.round(t.strokeWidth * 1000) / 10;
    el.strokeWidth.value = String(strokeValue);
    el.strokeWidthVal.textContent = String(strokeValue);
    el.shadowOn.checked = t.shadowOn;
    el.plateOn.checked = t.plateOn;
    el.plateControls.hidden = !t.plateOn;
    el.plateColor.value = t.plateColor;
    el.plateOpacity.value = String(t.plateOpacity * 100);
    el.plateOpacityVal.textContent = `${Math.round(t.plateOpacity * 100)}%`;
    updateSwatchActive();
    updatePresetActive();
  }

  function updateTextCount() {
    el.textCount.textContent = `${state.sig.text.content.length} / 40`;
  }

  function updateSwatchActive() {
    const color = state.sig.text.color.toLowerCase();
    $$('.swatch', el.swatches).forEach((swatch) => {
      swatch.classList.toggle('is-active', swatch.dataset.color.toLowerCase() === color);
    });
  }

  function clearPreset() {
    state.sig.presetId = '';
    $$('#presetRow button').forEach((button) => button.classList.remove('is-active'));
  }

  function updatePresetActive() {
    const presetId = state.sig.presetId;
    $$('#presetRow button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.preset === presetId);
    });
  }

  function setTextColor(hex) {
    state.sig.text.color = hex;
    el.textColor.value = hex;
    el.colorHex.textContent = hex.toUpperCase();
    updateSwatchActive();
    clearPreset();
    updateSigList();
    requestRender();
  }

  function applyPreset(id) {
    const preset = PRESETS[id];
    if (!preset) return;
    const font = findFont(preset.fontId);
    state.sig.text.fontId = font.id;
    state.sig.text.fontStack = font.stack;
    Object.assign(state.sig.text, preset.text);
    state.sig.presetId = id;
    syncTextUI();
    updateSigList();
    requestRender();
  }

  function setType(type) {
    if (!['text', 'draw', 'image'].includes(type)) return;
    state.sig.type = type;
    state.sig.visible = true;
    $$('#typeTabs button').forEach((button) => {
      const active = button.dataset.type === type;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $$('.pane').forEach((pane) => {
      pane.hidden = pane.dataset.pane !== type;
    });
    requestRender();
  }

  function syncTypeUI() {
    setType(state.sig.type);
  }

  function syncDrawUI() {
    el.penColor.value = state.sig.draw.color;
    el.penWidth.value = String(state.sig.draw.width);
    el.penWidthVal.textContent = String(state.sig.draw.width);
  }

  /* ============================== 手写 ============================== */

  function padPoint(event) {
    const rect = el.padCanvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1)
    };
  }

  function repaintPad() {
    padCtx.clearRect(0, 0, PAD_W, PAD_H);
    padCtx.lineCap = 'round';
    padCtx.lineJoin = 'round';
    const all = state.padStroke ? state.sig.draw.strokes.concat([state.padStroke]) : state.sig.draw.strokes;
    for (const stroke of all) {
      padCtx.strokeStyle = stroke.color;
      padCtx.fillStyle = stroke.color;
      padCtx.lineWidth = Math.max(1, stroke.width * PAD_H);
      traceStroke(padCtx, stroke.points, (p) => p.x * PAD_W, (p) => p.y * PAD_H);
    }
  }

  function schedulePadPaint() {
    if (state.padRaf) return;
    state.padRaf = requestAnimationFrame(() => {
      state.padRaf = 0;
      repaintPad();
    });
  }

  function updatePadUI() {
    const count = state.sig.draw.strokes.length;
    el.padCount.textContent = `${count} 笔`;
    el.padPlaceholder.hidden = count > 0 || Boolean(state.padStroke);
    el.btnPadUndo.disabled = count === 0;
    el.btnPadClear.disabled = count === 0;
  }

  function onPadDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    try { el.padCanvas.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    const point = padPoint(event);
    state.padStroke = {
      color: state.sig.draw.color,
      width: state.sig.draw.width / PAD_H,
      points: [point]
    };
    updatePadUI();
    schedulePadPaint();
  }

  function onPadMove(event) {
    if (!state.padStroke) return;
    event.preventDefault();
    const point = padPoint(event);
    const points = state.padStroke.points;
    const last = points[points.length - 1];
    if (Math.hypot((point.x - last.x) * PAD_ASPECT, point.y - last.y) < 0.0035) return;
    points.push(point);
    schedulePadPaint();
  }

  function onPadUp(event) {
    if (!state.padStroke) return;
    if (event && event.pointerId !== undefined) {
      try { el.padCanvas.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
    }
    if (state.padStroke.points.length) {
      state.sig.draw.strokes.push(state.padStroke);
      state.sig.type = 'draw';
      state.sig.visible = true;
      setType('draw');
    }
    state.padStroke = null;
    updatePadUI();
    repaintPad();
    updateSigList();
    requestRender();
  }

  function undoPad() {
    if (!state.sig.draw.strokes.length) return;
    state.sig.draw.strokes.pop();
    updatePadUI();
    repaintPad();
    requestRender();
  }

  function clearPad() {
    state.sig.draw.strokes = [];
    state.padStroke = null;
    updatePadUI();
    repaintPad();
    requestRender();
  }

  /* ============================== 图片签名 ============================== */

  function applyWhiteCut(canvas, tolerance) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 255 - tolerance * 0.6;
    const soft = 26;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      if (max - min > 34) continue;
      if (min >= threshold) {
        data[i + 3] = 0;
      } else if (min >= threshold - soft) {
        const keep = (threshold - min) / soft;
        data[i + 3] = Math.round(data[i + 3] * clamp(keep, 0, 1));
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function alphaBounds(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < height; y += 1) {
      const row = y * width * 4;
      for (let x = 0; x < width; x += 1) {
        if (data[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return null;
    return { x0, y0, x1, y1 };
  }

  function rebuildSignatureImage(showError) {
    const image = state.sig.image;
    if (!image.source) {
      image.canvas = null;
      updateSigImageUI();
      requestRender();
      return;
    }
    const src = image.source;
    const max = 1600;
    const scale = Math.min(1, max / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    if (image.whiteCut) applyWhiteCut(canvas, image.tolerance);

    const bounds = alphaBounds(canvas);
    if (!bounds && image.whiteCut) {
      image.whiteCut = false;
      if (showError) toast('已自动关闭去白底：这张签名本身是透明的');
      rebuildSignatureImage(false);
      updateSigImageUI();
      return;
    }
    if (!bounds) {
      image.canvas = null;
      image.aspect = 1;
      updateSigImageUI();
      requestRender();
      if (showError) toast('这张签名图片几乎是空白的', true);
      return;
    }

    const pad = 2;
    const sx = Math.max(0, bounds.x0 - pad);
    const sy = Math.max(0, bounds.y0 - pad);
    const sw = Math.min(canvas.width - sx, bounds.x1 - bounds.x0 + 1 + pad * 2);
    const sh = Math.min(canvas.height - sy, bounds.y1 - bounds.y0 + 1 + pad * 2);
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    image.canvas = out;
    image.aspect = out.width / out.height;
    updateSigImageUI();
    requestRender();
  }

  function drawSigThumb() {
    const canvas = el.sigThumb;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const src = state.sig.image.canvas;
    if (!src) return;
    const scale = Math.min(canvas.width / src.width, canvas.height / src.height) * 0.92;
    const w = src.width * scale;
    const h = src.height * scale;
    ctx.drawImage(src, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  function updateSigImageUI() {
    const image = state.sig.image;
    el.sigImageCard.hidden = !image.source;
    el.btnSigImage.classList.toggle('is-compact', Boolean(image.source));
    el.sigImgName.textContent = image.name || '签名图片';
    el.whiteCut.checked = image.whiteCut;
    el.whiteStrength.disabled = !image.whiteCut;
    el.whiteStrength.value = String(image.tolerance);
    el.whiteVal.textContent = String(image.tolerance);
    if (image.canvas) {
      el.sigImgSize.textContent = `${image.canvas.width} × ${image.canvas.height} px`;
    } else {
      el.sigImgSize.textContent = '—';
    }
    drawSigThumb();
  }

  async function loadSignatureImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('请选择一张签名图片', true);
      return;
    }
    try {
      const bitmap = await fileToBitmap(file);
      const previous = state.sig.image.source;
      if (previous && previous !== bitmap && typeof previous.close === 'function') {
        try { previous.close(); } catch (error) { /* ignore */ }
      }
      state.sig.image.source = bitmap;
      state.sig.image.name = file.name;
      rebuildSignatureImage(true);
      setType('image');
      syncTypeUI();
      updateSigList();
      toast('签名图片已载入');
    } catch (error) {
      console.error(error);
      toast('签名图片读取失败', true);
    }
  }

  function clearSignatureImage() {
    state.sig.image.source = null;
    state.sig.image.canvas = null;
    state.sig.image.name = '';
    el.sigImageFile.value = '';
    updateSigImageUI();
    updateSigList();
    requestRender();
  }

  /* ============================== 照片加载 ============================== */

  function isImageFile(file) {
    return Boolean(file) && (file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name));
  }

  async function fileToBitmap(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      return await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('decode failed'));
        };
        image.src = url;
      });
    }
  }

  function applyPhoto(image, name, bytes) {
    if (state.image && state.image !== image && typeof state.image.close === 'function') {
      try { state.image.close(); } catch (error) { /* ignore */ }
    }
    state.image = image;
    state.imageW = image.width;
    state.imageH = image.height;
    state.imageName = name;
    state.imageBytes = bytes;
    state.compare = false;
    el.btnCompare.classList.remove('is-active');

    el.emptyState.hidden = true;
    el.stageCanvas.hidden = false;
    el.stageTopline.hidden = false;
    el.stageFooter.hidden = false;
    el.btnReplace.disabled = false;
    el.fileInfo.classList.remove('is-empty');
    el.fileName.textContent = name;
    el.fileDims.textContent = `${state.imageW} × ${state.imageH} px${bytes ? ` · ${formatBytes(bytes)}` : ' · 示例图片'}`;
    el.stageBadge.textContent = `${state.imageW} × ${state.imageH} px`;

    updateFileThumb();
    buildSampleCanvas();
    fitCanvas();
    syncTextUI();
    syncPlacementUI();
    updateExportUI();
    state.sig.visible = true;
    requestRender();
    toast('照片已载入');
  }

  function updateFileThumb() {
    if (!state.image) return;
    const size = 120;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.max(size / state.imageW, size / state.imageH);
    const w = state.imageW * scale;
    const h = state.imageH * scale;
    try {
      ctx.drawImage(state.image, (size - w) / 2, (size - h) / 2, w, h);
      el.fileThumb.style.backgroundImage = `url(${canvas.toDataURL('image/jpeg', 0.75)})`;
      el.fileThumb.style.backgroundSize = 'cover';
    } catch (error) {
      /* ignore */
    }
  }

  function buildSampleCanvas() {
    const max = 1400;
    const scale = Math.min(1, max / Math.max(state.imageW, state.imageH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(state.imageW * scale));
    canvas.height = Math.max(1, Math.round(state.imageH * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
    state.sampleCanvas = canvas;
    state.sampleCtx = ctx;
  }

  async function loadPhoto(file) {
    if (!isImageFile(file)) {
      toast('请选择 JPG / PNG / WebP 图片', true);
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      toast('图片较大，处理可能需要一点时间');
    }
    try {
      const bitmap = await fileToBitmap(file);
      applyPhoto(bitmap, file.name, file.size);
    } catch (error) {
      console.error(error);
      toast('这张图片无法读取，请换一个格式试试', true);
    }
  }

  /* ============================== 导出 ============================== */

  function computeExportSize() {
    if (!state.image) return { w: 0, h: 0, ok: false };
    const w = Math.round(state.imageW * state.scale);
    const h = Math.round(state.imageH * state.scale);
    const ok = w > 0 && h > 0 && w <= MAX_EXPORT_SIDE && h <= MAX_EXPORT_SIDE && w * h <= MAX_EXPORT_PIXELS;
    return { w, h, ok };
  }

  function updateExportUI() {
    const format = FORMATS[state.format];
    $$('#formatTabs button').forEach((button) => {
      const active = button.dataset.format === state.format;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $$('#scaleChips button').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.scale) === state.scale);
    });
    el.extLabel.textContent = format.ext;
    el.qualityField.hidden = state.format === 'png';
    el.qualityVal.textContent = String(Math.round(state.quality * 100));

    const size = computeExportSize();
    if (state.image) {
      el.exportDimHint.textContent = `${size.w} × ${size.h}`;
      el.exportNote.textContent = size.ok
        ? `输出 ${size.w} × ${size.h} px · ${format.label}`
        : '这个倍率会超出浏览器画布上限，请降低倍率';
      el.exportNote.classList.toggle('is-warn', !size.ok);
    } else {
      el.exportDimHint.textContent = '—';
      el.exportNote.textContent = '导入照片后可导出';
      el.exportNote.classList.remove('is-warn');
    }

    const disabled = !state.image || !size.ok || state.exporting;
    el.btnExport.disabled = disabled;
    el.btnExportTop.disabled = disabled;
    el.btnExport.textContent = state.exporting ? '正在导出…' : '导出图片';
    el.btnExportTop.textContent = state.exporting ? '导出中…' : '导出图片';
  }

  async function exportImage() {
    if (!state.image || state.exporting) return;
    const size = computeExportSize();
    if (!size.ok) {
      toast('导出尺寸超出上限，请降低倍率', true);
      return;
    }
    state.exporting = true;
    updateExportUI();
    try {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = document.createElement('canvas');
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext('2d');
      drawScene(ctx, size.w, size.h, state.format !== 'png');
      const format = FORMATS[state.format];
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), format.mime, state.quality);
      });
      const rawName = (el.exportName.value || '落款').trim().replace(/[\\/:*?"<>|\r\n]/g, '-').slice(0, 40) || '落款';
      const base = rawName.replace(/\.(png|jpe?g|webp)$/i, '');
      const fileName = `${base}${format.ext}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 20000);
      toast(`已导出 ${fileName} · ${size.w} × ${size.h}`);
    } catch (error) {
      console.error(error);
      toast('导出失败，请调整尺寸后重试', true);
    } finally {
      state.exporting = false;
      updateExportUI();
    }
  }

  /* ============================== 事件绑定 ============================== */

  function bindEvents() {
    el.btnImport.addEventListener('click', () => el.fileInput.click());
    el.btnPick.addEventListener('click', () => el.fileInput.click());
    el.btnReplace.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      el.fileInput.value = '';
      if (file) loadPhoto(file);
    });

    el.btnExport.addEventListener('click', exportImage);
    el.btnExportTop.addEventListener('click', exportImage);

    el.btnAddSig.addEventListener('click', addSignature);
    el.sigList.addEventListener('click', (event) => {
      const removeButton = event.target.closest('button[data-del]');
      if (removeButton) {
        event.stopPropagation();
        removeSignature(removeButton.dataset.del);
        return;
      }
      const row = event.target.closest('.sig-row');
      if (row) selectSignature(row.dataset.id);
    });
    el.sigList.addEventListener('keydown', (event) => {
      if (event.target.closest('.sig-del')) return;
      const row = event.target.closest('.sig-row');
      if (!row) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectSignature(row.dataset.id);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSignature(row.dataset.id);
      }
    });

    el.typeTabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-type]');
      if (!button) return;
      setType(button.dataset.type);
      updateSigList();
    });

    el.signText.addEventListener('input', () => {
      state.sig.text.content = el.signText.value;
      state.sig.label = el.signText.value.trim();
      state.textTouched = true;
      state.sig.visible = true;
      updateTextCount();
      clearPreset();
      updateSigList();
      requestRender();
    });
    el.signText.addEventListener('focus', () => {
      if (!state.textTouched && el.signText.value === '你的签名') {
        el.signText.select();
        state.textTouched = true;
      }
    });

    el.fontSelect.addEventListener('change', () => applyFont(el.fontSelect.value));
    el.btnFont.addEventListener('click', () => el.fontFile.click());
    el.fontFile.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      el.fontFile.value = '';
      if (file) await loadFontFile(file);
    });

    el.presetRow.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-preset]');
      if (button) applyPreset(button.dataset.preset);
    });

    el.moreToggle.addEventListener('click', () => {
      const expanded = el.moreToggle.getAttribute('aria-expanded') === 'true';
      el.moreToggle.setAttribute('aria-expanded', String(!expanded));
      el.moreStyles.hidden = expanded;
    });

    el.swatches.addEventListener('click', (event) => {
      const swatch = event.target.closest('.swatch');
      if (swatch) setTextColor(swatch.dataset.color);
    });
    el.textColor.addEventListener('input', () => setTextColor(el.textColor.value));
    el.btnEyedropper.addEventListener('click', () => {
      if (state.pickColor) stopEyedropper();
      else startEyedropper();
    });

    el.spacingRange.addEventListener('input', () => {
      const value = Number(el.spacingRange.value);
      state.sig.text.spacing = value / 100;
      el.spacingVal.textContent = String(value);
      clearPreset();
      requestRender();
    });

    el.boldBtn.addEventListener('click', () => {
      state.sig.text.bold = !state.sig.text.bold;
      el.boldBtn.classList.toggle('is-active', state.sig.text.bold);
      el.boldBtn.setAttribute('aria-pressed', String(state.sig.text.bold));
      clearPreset();
      requestRender();
    });
    el.italicBtn.addEventListener('click', () => {
      state.sig.text.italic = !state.sig.text.italic;
      el.italicBtn.classList.toggle('is-active', state.sig.text.italic);
      el.italicBtn.setAttribute('aria-pressed', String(state.sig.text.italic));
      clearPreset();
      requestRender();
    });

    el.strokeOn.addEventListener('change', () => {
      state.sig.text.strokeOn = el.strokeOn.checked;
      el.strokeControls.hidden = !el.strokeOn.checked;
      clearPreset();
      requestRender();
    });
    el.strokeColor.addEventListener('input', () => {
      state.sig.text.strokeColor = el.strokeColor.value;
      clearPreset();
      requestRender();
    });
    el.strokeWidth.addEventListener('input', () => {
      const value = Number(el.strokeWidth.value);
      state.sig.text.strokeWidth = value / 100;
      el.strokeWidthVal.textContent = String(value);
      clearPreset();
      requestRender();
    });

    el.shadowOn.addEventListener('change', () => {
      state.sig.text.shadowOn = el.shadowOn.checked;
      clearPreset();
      requestRender();
    });

    el.plateOn.addEventListener('change', () => {
      state.sig.text.plateOn = el.plateOn.checked;
      el.plateControls.hidden = !el.plateOn.checked;
      clearPreset();
      requestRender();
    });
    el.plateColor.addEventListener('input', () => {
      state.sig.text.plateColor = el.plateColor.value;
      clearPreset();
      requestRender();
    });
    el.plateOpacity.addEventListener('input', () => {
      const value = Number(el.plateOpacity.value);
      state.sig.text.plateOpacity = value / 100;
      el.plateOpacityVal.textContent = `${value}%`;
      clearPreset();
      requestRender();
    });

    // 手写
    el.padCanvas.addEventListener('pointerdown', onPadDown);
    el.padCanvas.addEventListener('pointermove', onPadMove);
    el.padCanvas.addEventListener('pointerup', onPadUp);
    el.padCanvas.addEventListener('pointercancel', onPadUp);
    el.btnPadUndo.addEventListener('click', undoPad);
    el.btnPadClear.addEventListener('click', clearPad);
    el.penColor.addEventListener('input', () => {
      state.sig.draw.color = el.penColor.value;
      updateSigList();
    });
    el.penWidth.addEventListener('input', () => {
      state.sig.draw.width = Number(el.penWidth.value);
      el.penWidthVal.textContent = String(state.sig.draw.width);
    });

    // 图片签名
    el.btnSigImage.addEventListener('click', () => el.sigImageFile.click());
    el.sigImageFile.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      el.sigImageFile.value = '';
      if (file) await loadSignatureImage(file);
    });
    el.btnSigImageClear.addEventListener('click', clearSignatureImage);
    el.whiteCut.addEventListener('change', () => {
      state.sig.image.whiteCut = el.whiteCut.checked;
      el.whiteStrength.disabled = !el.whiteCut.checked;
      if (state.sig.image.source) rebuildSignatureImage(false);
    });
    el.whiteStrength.addEventListener('input', () => {
      const value = Number(el.whiteStrength.value);
      state.sig.image.tolerance = value;
      el.whiteVal.textContent = String(value);
      window.clearTimeout(whiteTimer);
      whiteTimer = window.setTimeout(() => {
        if (state.sig.image.source && state.sig.image.whiteCut) rebuildSignatureImage(false);
      }, 120);
    });

    // 位置
    el.posX.addEventListener('input', () => {
      state.sig.cx = clamp(Number(el.posX.value) / 100, 0, 1);
      syncPlacementUI();
      requestRender();
    });
    el.posY.addEventListener('input', () => {
      state.sig.cy = clamp(Number(el.posY.value) / 100, 0, 1);
      syncPlacementUI();
      requestRender();
    });
    el.sizeRange.addEventListener('input', () => {
      state.sig.size = clamp(Number(el.sizeRange.value) / 100, 0.015, 0.6);
      syncPlacementUI();
      requestRender();
    });
    el.rotRange.addEventListener('input', () => {
      state.sig.rotation = clamp(Number(el.rotRange.value), -45, 45);
      syncPlacementUI();
      requestRender();
    });
    el.opacityRange.addEventListener('input', () => {
      state.sig.opacity = clamp(Number(el.opacityRange.value) / 100, 0.1, 1);
      syncPlacementUI();
      requestRender();
    });

    el.posGrid.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-pos]');
      if (button) placeSignature(button.dataset.pos);
    });
    el.btnResetPos.addEventListener('click', () => {
      state.sig.cx = 0.8;
      state.sig.cy = 0.86;
      state.sig.size = 0.085;
      state.sig.rotation = 0;
      state.sig.opacity = 1;
      state.activePos = '';
      syncPlacementUI();
      requestRender();
    });

    // 画布拖拽
    el.stageCanvas.addEventListener('pointerdown', onPointerDown);
    el.stageCanvas.addEventListener('pointermove', onPointerMove);
    el.stageCanvas.addEventListener('pointerup', endDrag);
    el.stageCanvas.addEventListener('pointercancel', endDrag);
    el.stageCanvas.addEventListener('lostpointercapture', endDrag);
    el.stageCanvas.addEventListener('pointerleave', () => {
      if (!state.drag && !state.pickColor) el.stageCanvas.style.cursor = 'default';
    });
    el.stageCanvas.addEventListener('wheel', onWheel, { passive: false });

    // 对比原图
    el.btnCompare.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      state.compare = true;
      el.btnCompare.classList.add('is-active');
      try { el.btnCompare.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
      requestRender();
    });
    const endCompare = () => {
      if (!state.compare) return;
      state.compare = false;
      el.btnCompare.classList.remove('is-active');
      requestRender();
    };
    el.btnCompare.addEventListener('pointerup', endCompare);
    el.btnCompare.addEventListener('pointercancel', endCompare);
    window.addEventListener('pointerup', endCompare);

    // 键盘
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
        if (!state.image) return;
        event.preventDefault();
        exportImage();
        return;
      }
      const tag = (event.target && event.target.tagName ? event.target.tagName : '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (event.target && event.target.isContentEditable)) return;
      if (event.key === 'Escape' && state.pickColor) {
        stopEyedropper();
        return;
      }
      if (!state.image) return;
      const step = event.shiftKey ? 0.01 : 0.002;
      let handled = true;
      if (event.key === 'ArrowLeft') state.sig.cx = clamp(state.sig.cx - step, 0, 1);
      else if (event.key === 'ArrowRight') state.sig.cx = clamp(state.sig.cx + step, 0, 1);
      else if (event.key === 'ArrowUp') state.sig.cy = clamp(state.sig.cy - step, 0, 1);
      else if (event.key === 'ArrowDown') state.sig.cy = clamp(state.sig.cy + step, 0, 1);
      else if (event.key === '[') state.sig.rotation = clamp(state.sig.rotation - 1, -45, 45);
      else if (event.key === ']') state.sig.rotation = clamp(state.sig.rotation + 1, -45, 45);
      else handled = false;
      if (!handled) return;
      event.preventDefault();
      state.activePos = '';
      syncPlacementUI();
      requestRender();
    });

    // 导出设置
    el.formatTabs.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-format]');
      if (!button) return;
      state.format = button.dataset.format;
      updateExportUI();
    });
    el.scaleChips.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-scale]');
      if (!button) return;
      state.scale = Number(button.dataset.scale);
      updateExportUI();
    });
    el.quality.addEventListener('input', () => {
      state.quality = Number(el.quality.value) / 100;
      el.qualityVal.textContent = el.quality.value;
    });

    // 拖拽 / 粘贴
    el.stage.addEventListener('dragenter', (event) => {
      event.preventDefault();
      el.stage.classList.add('is-dragover');
    });
    el.stage.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
    el.stage.addEventListener('dragleave', (event) => {
      if (!el.stage.contains(event.relatedTarget)) el.stage.classList.remove('is-dragover');
    });
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => {
      event.preventDefault();
      el.stage.classList.remove('is-dragover');
      const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
      if (file) loadPhoto(file);
    });
    window.addEventListener('paste', (event) => {
      const items = event.clipboardData && event.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            loadPhoto(file);
            return;
          }
        }
      }
    });

    const observer = new ResizeObserver(() => {
      if (fitRaf) cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => {
        fitRaf = 0;
        fitCanvas();
      });
    });
    observer.observe(el.stage);
    window.addEventListener('resize', () => {
      if (fitRaf) cancelAnimationFrame(fitRaf);
      fitRaf = requestAnimationFrame(() => {
        fitRaf = 0;
        fitCanvas();
      });
    });
  }

  /* ============================== 自检 ============================== */

  async function runSelfTest() {
    const result = document.createElement('div');
    result.id = 'selftest';
    try {
      await document.fonts.ready;
      if (!state.image) throw new Error('no image');
      const canvas = document.createElement('canvas');
      const W = Math.min(state.imageW, 1600);
      const H = Math.round((state.imageH / state.imageW) * W);
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      drawScene(ctx, W, H, false);
      const url = canvas.toDataURL('image/png');
      const measured = measureSignature(ctx, state.sig, W, H);
      const ok = url.length > 5000 && Boolean(measured) && measured.w > 10;
      result.dataset.ok = ok ? '1' : '0';
      result.textContent = JSON.stringify({ w: W, h: H, urlLength: url.length, measured: Boolean(measured) });
      document.title = ok ? `SELFTEST_OK ${W}x${H}` : 'SELFTEST_FAIL';
    } catch (error) {
      result.dataset.ok = '0';
      result.textContent = `SELFTEST_FAIL ${error.message}`;
      document.title = `SELFTEST_FAIL ${error.message}`;
    }
    result.style.cssText = 'position:fixed;left:0;bottom:0;opacity:0.01;font-size:8px;pointer-events:none';
    document.body.appendChild(result);
  }

  /* ============================== 启动 ============================== */

  function initUI() {
    const first = createSignature('你的签名');
    first.cx = 0.8;
    first.cy = 0.86;
    state.signatures = [first];
    state.activeId = first.id;
    state.sig = first;

    buildFontSelect();
    bindEvents();
    setType('text');
    syncTextUI();
    syncPlacementUI();
    syncDrawUI();
    updatePadUI();
    updateSigImageUI();
    updateExportUI();
    updateTextCount();
    updateSigList();
    repaintPad();
  }

  window.addEventListener('error', (event) => {
    document.documentElement.dataset.lastError = event.message || 'unknown error';
    console.error(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    document.documentElement.dataset.lastError = String(event.reason);
    console.error(event.reason);
  });

  initUI();

  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    window.__SIG = {
      state,
      renderPreview,
      measureSignature,
      drawScene,
      exportImage,
      applyPhoto,
      fitCanvas,
      setType,
      addSignature,
      selectSignature,
      removeSignature,
      updateSigList
    };
  }

  (async function boot() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('selftest') === '1') await runSelfTest();
  })();
})();
