(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AliasCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SEPARATOR = "----";
  const MAX_ALIASES = 200000;
  const MAX_INPUT_CHARS = 5 * 1024 * 1024;
  const MAX_INPUT_LINES = 100000;
  const MAX_LINE_CHARS = 4096;
  const MAX_DIAGNOSTICS = 200;
  const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PREFIX_RE = /^[A-Za-z0-9_-]{1,24}$/;
  // *.example variants keep bundled demos and tests inside RFC-reserved space.
  const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "gmail.example"]);
  const ICLOUD_DOMAINS = new Set(["icloud.com", "me.com", "mac.com", "icloud.example"]);
  const MICROSOFT_DOMAINS = new Set([
    "hotmail.com", "outlook.com", "live.com", "msn.com", "windowslive.com",
    "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it", "hotmail.es",
    "hotmail.co.jp", "outlook.co.uk", "outlook.fr", "outlook.de", "outlook.example"
  ]);

  function normalizeText(value) {
    return String(value || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  }

  function splitEmail(value) {
    const email = String(value || "").trim();
    if (email.length > 320) return null;
    if (!EMAIL_RE.test(email)) return null;
    const at = email.lastIndexOf("@");
    return {
      email,
      local: email.slice(0, at),
      domain: email.slice(at + 1).toLowerCase()
    };
  }

  function providerForDomain(domain) {
    if (GMAIL_DOMAINS.has(domain)) return "gmail";
    if (ICLOUD_DOMAINS.has(domain)) return "icloud";
    if (
      MICROSOFT_DOMAINS.has(domain) ||
      domain.startsWith("hotmail.") ||
      domain.startsWith("outlook.") ||
      domain.startsWith("live.")
    ) return "microsoft";
    return "custom";
  }

  function parseInput(value, options) {
    const format = options && options.format ? options.format : "auto";
    const normalized = normalizeText(value);
    if (normalized.length > MAX_INPUT_CHARS) throw new Error("输入超过 5 MiB 字符安全上限，请拆分后处理。");
    let lineCount = 1;
    for (let index = 0; index < normalized.length; index += 1) {
      if (normalized.charCodeAt(index) === 10 && ++lineCount > MAX_INPUT_LINES) {
        throw new Error(`输入超过 ${MAX_INPUT_LINES.toLocaleString()} 行安全上限，请拆分后处理。`);
      }
    }
    const lines = normalized.split("\n");
    const records = [];
    const diagnostics = [];
    let ignored = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      const clean = raw.trim();
      if (!clean || clean.startsWith("#")) continue;
      if (raw.length > MAX_LINE_CHARS) {
        ignored += 1;
        if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ line: index + 1, type: "invalid", message: "单行超过安全上限" });
        continue;
      }

      if (clean.includes(SEPARATOR)) {
        const parts = clean.split(SEPARATOR);
        const parsed = splitEmail(parts.shift());
        if (!parsed) {
          ignored += 1;
          if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ line: index + 1, type: "invalid", message: "未识别为邮箱记录" });
          continue;
        }
        records.push({ ...parsed, metadata: parts.join(SEPARATOR).trim().slice(0, MAX_LINE_CHARS), sourceLine: index + 1 });
        continue;
      }

      const parsed = splitEmail(clean);
      if (!parsed) {
        ignored += 1;
        if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ line: index + 1, type: "invalid", message: "未识别为邮箱记录" });
        continue;
      }

      let metadata = "";
      const sourceLine = index + 1;
      const allowPair = format === "paired" || (format === "auto" && providerForDomain(parsed.domain) === "gmail");
      if (allowPair && index + 1 < lines.length) {
        const candidate = lines[index + 1].trim();
        const explicitPair = format === "paired";
        if (candidate && !candidate.startsWith("#") && (explicitPair || !splitEmail(candidate))) {
          metadata = candidate.slice(0, MAX_LINE_CHARS);
          index += 1;
        }
      }
      records.push({ ...parsed, metadata, sourceLine });
    }

    return { records, diagnostics, ignored };
  }

  function providerMatches(actual, selected) {
    if (selected === "custom") return true;
    if (selected === "auto") return actual === "gmail" || actual === "microsoft";
    return actual === selected;
  }

  function validateSettings(settings, recordCount) {
    const count = Number(settings.count);
    if (!Number.isInteger(count) || count < 1 || count > 50000) {
      throw new Error("每个邮箱的别名数量必须是 1–50000 的整数。");
    }
    if (!PREFIX_RE.test(String(settings.prefix || ""))) {
      throw new Error("标签前缀只可使用 1–24 位英文字母、数字、下划线或连字符。");
    }
    if (recordCount * count > MAX_ALIASES) {
      throw new Error(`本次将生成超过 ${MAX_ALIASES.toLocaleString()} 个地址，请减少输入或数量。`);
    }
    return count;
  }

  function buildLine(email, metadata, settings) {
    if (!settings.keepMetadata || !metadata) return email;
    if (settings.outputFormat === "paired") return `${email}\n${metadata}`;
    return `${email}${SEPARATOR}${metadata}`;
  }

  function utf8Length(value) {
    return new TextEncoder().encode(String(value || "")).length;
  }

  function validateOutputBudget(records, settings, count) {
    let bytes = 0;
    function add(email, metadata) {
      bytes += utf8Length(buildLine(email, metadata, settings)) + 1;
      if (bytes > MAX_OUTPUT_BYTES) {
        throw new Error("预计输出超过 32 MiB 安全上限，请减少输入、数量或附加字段。");
      }
    }
    for (const record of records) {
      const actual = providerForDomain(record.domain);
      if (!providerMatches(actual, settings.provider) || record.local.includes("+")) continue;
      if (settings.includeOriginal) add(record.email, record.metadata);
      for (let index = 1; index <= count; index += 1) {
        add(`${record.local}+${settings.prefix}${index}@${record.domain}`, record.metadata);
      }
    }
  }

  function generate(records, rawSettings) {
    const settings = {
      provider: "auto",
      count: 5,
      prefix: "g",
      includeOriginal: false,
      keepMetadata: false,
      outputFormat: "single",
      ...rawSettings
    };
    const count = validateSettings(settings, records.length);
    validateOutputBudget(records, settings, count);
    const lines = [];
    const preview = [];
    const seen = new Set();
    const stats = { records: records.length, generated: 0, skipped: 0, duplicates: 0 };
    const providers = { gmail: 0, microsoft: 0, icloud: 0, custom: 0 };
    const warnings = [];

    function append(email, metadata, isAlias) {
      const key = email.toLowerCase();
      if (seen.has(key)) {
        stats.duplicates += 1;
        return;
      }
      seen.add(key);
      lines.push(buildLine(email, metadata, settings));
      if (preview.length < 80) {
        preview.push(settings.keepMetadata && metadata ? `${email}${SEPARATOR}••••••` : email);
      }
      if (isAlias) stats.generated += 1;
    }

    for (const record of records) {
      const actual = providerForDomain(record.domain);
      providers[actual] += 1;
      if (!providerMatches(actual, settings.provider) || record.local.includes("+")) {
        stats.skipped += 1;
        continue;
      }
      if (settings.includeOriginal) append(record.email, record.metadata, false);
      for (let index = 1; index <= count; index += 1) {
        append(`${record.local}+${settings.prefix}${index}@${record.domain}`, record.metadata, true);
      }
    }

    if (settings.provider === "icloud") {
      warnings.push("Apple 的公开文档没有承诺动态 + 地址；请先用自己的邮箱实测投递。官方可用方式是已创建的 iCloud 别名或 Hide My Email。 ");
    }
    if (settings.provider === "custom") {
      warnings.push("自定义域是否支持 + 地址由邮件服务商决定；请先小批量验证收件。");
    }
    if (stats.skipped) warnings.push(`有 ${stats.skipped} 条记录因服务商不匹配或已带 + 标签而跳过。`);

    const text = lines.join("\n") + (lines.length ? "\n" : "");
    return {
      text,
      preview,
      stats,
      providers,
      warnings,
      outputLines: text ? text.trimEnd().split("\n").length : 0
    };
  }

  return {
    MAX_ALIASES,
    MAX_INPUT_CHARS,
    MAX_INPUT_LINES,
    MAX_OUTPUT_BYTES,
    SEPARATOR,
    generate,
    normalizeText,
    parseInput,
    providerForDomain,
    splitEmail,
    validateSettings
  };
});
