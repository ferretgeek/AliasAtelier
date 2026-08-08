(function () {
  "use strict";

  const core = window.AliasCore;
  const elements = {
    source: document.querySelector("#source-input"),
    sourceCount: document.querySelector("#source-count"),
    parseStatus: document.querySelector("#parse-status"),
    file: document.querySelector("#file-input"),
    drop: document.querySelector("#drop-zone"),
    demo: document.querySelector("#demo-button"),
    provider: document.querySelector("#provider-select"),
    count: document.querySelector("#count-input"),
    prefix: document.querySelector("#prefix-input"),
    format: document.querySelector("#format-select"),
    includeOriginal: document.querySelector("#original-toggle"),
    metadata: document.querySelector("#metadata-toggle"),
    outputFormat: document.querySelector("#output-format-select"),
    outputFormatWrap: document.querySelector("#output-format-wrap"),
    providerNote: document.querySelector("#provider-note"),
    generate: document.querySelector("#generate-button"),
    copy: document.querySelector("#copy-button"),
    download: document.querySelector("#download-button"),
    preview: document.querySelector("#output-preview"),
    previewLimit: document.querySelector("#preview-limit"),
    warnings: document.querySelector("#warnings"),
    toast: document.querySelector("#toast"),
    stats: {
      records: document.querySelector("#stat-records"),
      generated: document.querySelector("#stat-generated"),
      skipped: document.querySelector("#stat-skipped"),
      lines: document.querySelector("#stat-lines")
    }
  };

  let latestText = "";
  let parsed = { records: [], ignored: 0, diagnostics: [] };
  let toastTimer = 0;

  function themeColor(theme) {
    return { sky: "#eef8ff", jade: "#edf8f1", sunset: "#fff3ec", graphite: "#17191d" }[theme];
  }

  function applyTheme(theme) {
    const value = ["sky", "jade", "sunset", "graphite"].includes(theme) ? theme : "sky";
    document.documentElement.dataset.theme = value;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", themeColor(value));
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      button.classList.toggle("active", button.dataset.themeChoice === value);
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === value));
    });
    try { localStorage.setItem("alias-atelier-theme", value); } catch (_) { /* storage is optional */ }
  }

  function notify(message, type) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.className = `toast show${type === "error" ? " error" : ""}`;
    toastTimer = window.setTimeout(() => { elements.toast.className = "toast"; }, 2800);
  }

  function parseSource() {
    parsed = core.parseInput(elements.source.value, { format: elements.format.value });
    elements.sourceCount.textContent = `${parsed.records.length.toLocaleString()} 条记录`;
    if (!elements.source.value.trim()) {
      elements.parseStatus.textContent = "等待输入";
      elements.parseStatus.className = "parse-status";
    } else if (!parsed.records.length) {
      elements.parseStatus.textContent = "没有找到可处理的邮箱地址";
      elements.parseStatus.className = "parse-status error";
    } else {
      const tail = parsed.ignored ? `，另有 ${parsed.ignored} 行未识别` : "";
      elements.parseStatus.textContent = `已在本地识别 ${parsed.records.length} 条记录${tail}`;
      elements.parseStatus.className = "parse-status";
    }
    return parsed;
  }

  function settings() {
    return {
      provider: elements.provider.value,
      count: Number(elements.count.value),
      prefix: elements.prefix.value.trim(),
      includeOriginal: elements.includeOriginal.checked,
      keepMetadata: elements.metadata.checked,
      outputFormat: elements.outputFormat.value
    };
  }

  function updateProviderNote() {
    const notes = {
      auto: ["稳妥默认值", "自动模式只处理有公开支持依据的 Gmail 与 Microsoft + 地址。", false],
      gmail: ["Gmail / Workspace", "Google 文档说明，+ 后的标签仍会投递到当前收件箱。", false],
      microsoft: ["Microsoft / Exchange Online", "Microsoft 文档说明，Plus Addressing 默认启用，但组织管理员可以关闭。", false],
      icloud: ["兼容性实验", "Apple 公开文档介绍的是已创建别名与 Hide My Email，并未承诺动态 + 地址。请先实测。", true],
      custom: ["兼容性实验", "任意域能否收取 + 地址由邮件服务商决定，请先用少量结果验证。", true]
    };
    const note = notes[elements.provider.value];
    elements.providerNote.classList.toggle("experimental", note[2]);
    elements.providerNote.querySelector("span").textContent = note[2] ? "!" : "✓";
    elements.providerNote.querySelector("p").replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = note[0];
    elements.providerNote.querySelector("p").append(strong, document.createTextNode(note[1]));
  }

  function render(result) {
    latestText = result.text;
    elements.stats.records.textContent = result.stats.records.toLocaleString();
    elements.stats.generated.textContent = result.stats.generated.toLocaleString();
    elements.stats.skipped.textContent = result.stats.skipped.toLocaleString();
    elements.stats.lines.textContent = result.outputLines.toLocaleString();
    elements.preview.textContent = result.preview.join("\n");
    if (!result.preview.length) {
      const empty = document.createElement("span");
      empty.className = "empty-state";
      empty.textContent = "没有生成结果，请检查服务商和输入格式。";
      elements.preview.replaceChildren(empty);
    }
    elements.previewLimit.textContent = result.outputLines > 80 ? "仅显示前 80 条" : `显示 ${result.outputLines.toLocaleString()} 条`;
    elements.copy.disabled = !latestText;
    elements.download.disabled = !latestText;
    elements.warnings.replaceChildren();
    const notices = [...result.warnings];
    if (elements.metadata.checked) notices.unshift("导出的 TXT 将包含原始附加字段；请把它当作敏感文件保存。预览仍已遮挡。");
    if (notices.length) {
      for (const message of notices) {
        const paragraph = document.createElement("p");
        paragraph.textContent = `· ${message}`;
        elements.warnings.append(paragraph);
      }
      elements.warnings.classList.remove("hidden");
    } else {
      elements.warnings.classList.add("hidden");
    }
  }

  function generate() {
    parseSource();
    if (!parsed.records.length) {
      notify("请先放入至少一个有效邮箱地址。", "error");
      elements.source.focus();
      return;
    }
    try {
      const result = core.generate(parsed.records, settings());
      render(result);
      document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
      notify(`已生成 ${result.stats.generated.toLocaleString()} 个别名。`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "生成失败，请检查设置。", "error");
    }
  }

  async function readFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("文件超过 5 MB。请拆分后再处理，以免浏览器卡顿。", "error");
      return;
    }
    try {
      elements.source.value = await file.text();
      parseSource();
      notify(`已在本地读取 ${file.name}`);
    } catch (_) {
      notify("文件读取失败，请确认它是普通文本。", "error");
    }
  }

  async function copyOutput() {
    if (!latestText) return;
    try {
      await navigator.clipboard.writeText(latestText);
      notify("已复制全部结果。复制后请留意剪贴板中的敏感内容。 ");
    } catch (_) {
      notify("浏览器没有授予剪贴板权限，请改用下载。", "error");
    }
  }

  function downloadOutput() {
    if (!latestText) return;
    const blob = new Blob([latestText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `alias-atelier-${stamp}.txt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("TXT 已生成。它只存在于你的下载目录。 ");
  }

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.themeChoice));
  });
  elements.source.addEventListener("input", parseSource);
  elements.format.addEventListener("change", parseSource);
  elements.provider.addEventListener("change", updateProviderNote);
  elements.metadata.addEventListener("change", () => {
    elements.outputFormatWrap.classList.toggle("hidden", !elements.metadata.checked);
    latestText = "";
    elements.copy.disabled = true;
    elements.download.disabled = true;
  });
  elements.demo.addEventListener("click", () => {
    elements.source.value = [
      "garden.notes@gmail.com----[example-only]",
      "studio.archive@outlook.com----[example-only]"
    ].join("\n");
    parseSource();
    notify("已载入不含真实身份的安全示例。 ");
  });
  elements.file.addEventListener("change", () => readFile(elements.file.files[0]));
  ["dragenter", "dragover"].forEach((eventName) => elements.drop.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.drop.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((eventName) => elements.drop.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.drop.classList.remove("dragging");
  }));
  elements.drop.addEventListener("drop", (event) => readFile(event.dataTransfer.files[0]));
  elements.generate.addEventListener("click", generate);
  elements.copy.addEventListener("click", copyOutput);
  elements.download.addEventListener("click", downloadOutput);

  let initialTheme = "sky";
  try { initialTheme = localStorage.getItem("alias-atelier-theme") || "sky"; } catch (_) { /* storage is optional */ }
  applyTheme(initialTheme);
  updateProviderNote();
  parseSource();
})();
