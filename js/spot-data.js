(function (root) {
  "use strict";
  const dataUrl = typeof document !== "undefined"
    ? new URL("../data/spots.json", document.currentScript.src).href : null;
  const categories = {
    sightseeing: { label: "観光施設", color: "#f3a8c8" },
    food: { label: "飲食店", color: "#fff462" },
    station: { label: "駅", color: "#2563eb" },
    onsen: { label: "温泉", color: "#c2894b" },
    souvenir: { label: "お土産", color: "#54917f" }
  };
  const fields = ["name", "desc", "photo", "youtube2", "youtube", "homepage"];
  const limits = { name: 100, desc: 3000, photo: 2000, youtube2: 2000, youtube: 2000, homepage: 2000 };
  const labels = { name: "スポット名", desc: "説明文", photo: "写真URL", youtube2: "ショート動画URL", youtube: "Vlog URL", homepage: "公式サイトURL" };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function safeUrl(value, allowAsset = false) {
    if (typeof value !== "string" || !value.trim()) return "";
    const text = value.trim();
    if (allowAsset && /^(\.\/)?assets\/[a-zA-Z0-9_./%\-]+$/.test(text) && !text.includes("..")) return text;
    try {
      const url = new URL(text);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function youtubeEmbed(value) {
    const safe = safeUrl(value);
    if (!safe) return "";
    const url = new URL(safe);
    let id = "";
    if (url.hostname === "youtu.be") id = url.pathname.slice(1);
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else id = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/)?.[1] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}` : "";
  }

  function fieldError(key, value) {
    if (typeof value !== "string") return `${labels[key]}は文字で入力してください。`;
    if (key === "name" && !value.trim()) return "スポット名を入力してください。";
    if (value.length > limits[key]) return `${labels[key]}は${limits[key]}文字以内にしてください。`;
    if (["photo", "homepage", "youtube", "youtube2"].includes(key) && value.trim()) {
      if (!safeUrl(value, key === "photo")) return `${labels[key]}のURLを確認してください。`;
      if (["youtube", "youtube2"].includes(key) && !youtubeEmbed(value)) return "YouTubeの動画URLを入力してください。";
    }
    return "";
  }

  function validate(spots) {
    if (!Array.isArray(spots) || spots.length === 0 || spots.length > 1000) throw new Error("スポットデータの形式が正しくありません。");
    const ids = new Set();
    for (const spot of spots) {
      if (!spot || !/^spot-\d{3,}$/.test(spot.id) || ids.has(spot.id)) throw new Error("スポットIDが未設定、重複、または不正です。");
      ids.add(spot.id);
      if (!Object.hasOwn(categories, spot.category)) throw new Error(`${spot.id}: カテゴリが不正です。`);
      if (!Number.isFinite(spot.lat) || Math.abs(spot.lat) > 90 || !Number.isFinite(spot.lon) || Math.abs(spot.lon) > 180) throw new Error(`${spot.id}: 位置情報が不正です。`);
      for (const key of fields) {
        const error = fieldError(key, spot[key] ?? "");
        if (error) throw new Error(`${spot.id}: ${error}`);
      }
    }
    return spots;
  }

  function mergeEditable(baseline, incoming) {
    validate(incoming);
    if (baseline.length !== incoming.length) throw new Error("スポットの追加・削除はこの編集画面ではできません。");
    const byId = new Map(incoming.map(spot => [spot.id, spot]));
    return baseline.map(original => {
      const edited = byId.get(original.id);
      if (!edited) throw new Error(`元データに対応しないIDがあります: ${original.id}`);
      for (const key of new Set([...Object.keys(original), ...Object.keys(edited)])) {
        if (!fields.includes(key) && original[key] !== edited[key]) throw new Error(`${original.id}: ID・位置・カテゴリなどの変更は読み込めません。`);
      }
      const result = { ...original };
      for (const key of fields) {
        if (Object.hasOwn(edited, key)) result[key] = edited[key];
        else delete result[key];
      }
      return result;
    });
  }

  async function load() {
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`スポット情報の読み込みに失敗しました (${response.status})`);
    return validate(await response.json());
  }

  const api = { categories, fields, limits, labels, escapeHtml, safeUrl, youtubeEmbed, fieldError, validate, mergeEditable, load };
  root.GyodaSpotData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
