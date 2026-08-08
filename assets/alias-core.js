(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AliasCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SEPARATOR = "----";
  const MAX_ALIASES = 200000;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PREFIX_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);
  const ICLOUD_DOMAINS = new Set(["icloud.com", "me.com", "mac.com"]);
  const MICROSOFT_DOMAINS = new Set([
    "hotmail.com", "outlook.com", "live.com", "msn.com", "windowslive.com",
    "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it", "hotmail.es",
    "hotmail.co.jp", "outlook.co.uk", "outlook.fr", "outlook.de"
  ]);

  function normalizeText(value) {
    return String(value || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  }

  function splitEmail(value) {
    const email = String(value || "").trim();
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
    const lines = normalizeText(value).split("\n");
    const records = [];
    const diagnostics = [];
    let ignored = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      const clean = raw.trim();
      if (!clean || clean.startsWith("#")) continue;

      if (clean.includes(SEPARATOR)) {
        const parts = clean.split(SEPARATOR);
        const parsed = splitEmail(parts.shift());
        if (!parsed) {
          ignored += 1;
          diagnostics.push({ line: index + 1, type: "invalid", message: "未识别为邮箱记录" });
          continue;
        }
        records.push({ ...parsed, metadata: parts.join(SEPARATOR).trim(), sourceLine: index + 1 });
        continue;
      }

      const parsed = splitEmail(clean);
      if (!parsed) {
        ignored += 1;
        diagnostics.push({ line: index + 1, type: "invalid", message: "未识别为邮箱记录" });
        continue;
      }

      let metadata = "";
      const sourceLine = index + 1;
      const allowPair = format === "paired" || (format === "auto" && providerForDomain(parsed.domain) === "gmail");
      if (allowPair && index + 1 < lines.length) {
        const candidate = lines[index + 1].trim();
        if (candidate && !candidate.startsWith("#") && !splitEmail(candidate)) {
          metadata = candidate;
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
    SEPARATOR,
    generate,
    normalizeText,
    parseInput,
    providerForDomain,
    splitEmail,
    validateSettings
  };
});
