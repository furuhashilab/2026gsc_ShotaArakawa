(function (root) {
  "use strict";
  const url = "https://vdchpxtbqkufzscgszuh.supabase.co";
  const key = "sb_publishable_G_hMexMzysucRJuhhpO8vA_EnM1AgAr";
  const fields = { name: "name", description: "desc", photo: "photo", youtube2: "youtube2", youtube: "youtube", homepage: "homepage" };
  const columns = "spot_id," + Object.keys(fields).join(",");
  function validate(card) {
    if (!card || typeof card.spot_id !== "string" || !/^spot-[0-9]{3,}$/.test(card.spot_id)) throw new Error("スポットIDが不正です。");
    const clean = { spot_id: card.spot_id };
    for (const [column, field] of Object.entries(fields)) {
      if (card[column] == null) throw new Error("写真・URLを含む6項目をオンライン保存してから再確認してください。");
      const message = root.GyodaSpotData.fieldError(field, card[column]);
      if (message) throw new Error(message);
      clean[column] = card[column];
    }
    return clean;
  }
  function fromSpot(spot) {
    return validate({ spot_id: spot.id, ...Object.fromEntries(Object.entries(fields).map(([column, field]) => [column, spot[field] ?? ""])) });
  }
  function apply(spot, card) {
    const clean = validate(card);
    if (spot.id !== clean.spot_id) throw new Error("スポットIDが一致しません。");
    const result = { ...spot };
    for (const [column, field] of Object.entries(fields)) result[field] = clean[column];
    return result;
  }
  function merge(spots, rows) {
    if (!Array.isArray(rows) || rows.length > 1000) throw new Error("公開データの形式が不正です。");
    const byId = new Map();
    for (const row of rows) {
      if (!row || byId.has(row.spot_id)) throw new Error("公開データのIDが重複または不正です。");
      byId.set(row.spot_id, row);
    }
    return spots.map(spot => {
      if (!byId.has(spot.id)) return { ...spot };
      try { return apply(spot, byId.get(spot.id)); }
      catch { console.warn(`公開カード ${spot.id} が不正なため元のデータを使用します。`); return { ...spot }; }
    });
  }
  async function load(spots, fetcher = root.fetch.bind(root)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(`${url}/rest/v1/spot_content_published?select=${columns}&limit=1000`, {
        headers: { apikey: key }, cache: "no-store", signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return merge(spots, await response.json());
    } catch (error) {
      console.warn("公開カードを取得できないため元のJSONで表示します。", error.message);
      return spots;
    } finally { clearTimeout(timer); }
  }
  const api = { url, key, fields, columns, validate, fromSpot, apply, merge, load };
  root.GyodaPublicationData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
