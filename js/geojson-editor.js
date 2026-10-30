(function () {
  "use strict";
  const api = GyodaGeoJSON;
  const $ = id => document.getElementById(id);
  const storageKey = "gyoda-geojson-editor-draft-v1";
  let added = { type: "FeatureCollection", features: [] };
  let pending = null;
  let prepared = null;
  let pendingIds = [];
  let pendingIndex = 0;
  let selectedId = "";
  let dirty = false;
  let map = null;
  let mapReady = false;
  let fileSequence = 0;
  function error(message = "") { $("geo-error").textContent = message; $("geo-error").hidden = !message; }
  function status(message) { $("geo-status").textContent = message; }
  function setDirty(value) { dirty = value; $("geo-save-state").textContent = value ? "未保存の変更あり" : "未保存の変更なし"; }
  const selected = () => added.features.find(feature => feature.id === selectedId);
  function populate(select, values, initial) {
    select.replaceChildren(...values.map(([value, text]) => {
      const option = document.createElement("option"); option.value = value; option.textContent = text; return option;
    }));
    if (initial !== undefined) select.value = initial;
  }
  for (const id of ["geo-category", "geo-edit-category"]) populate($(id), Object.entries(api.categories), "other");
  function settings() {
    return { nameKey: $("geo-name-key").value, descriptionKey: $("geo-desc-key").value, category: $("geo-category").value, color: $("geo-color").value };
  }
  function previewData(collection, isPending) {
    return { type: "FeatureCollection", features: (collection?.features || []).map((feature, index) => ({
      type: "Feature", geometry: feature.geometry,
      properties: { featureId: feature.id, index, color: feature.gyoda.color, selected: !isPending && feature.id === selectedId }
    })) };
  }
  function draw() {
    if (!mapReady) return;
    map.getSource("added").setData(previewData(added, false));
    map.getSource("pending").setData(previewData(prepared, true));
  }
  function fit(collection) {
    if (!mapReady || !collection?.features.length) return;
    const bounds = api.normalize(collection).bounds;
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 45, maxZoom: 16, duration: 500 });
  }
  function fitAll() {
    const features = [...added.features, ...(prepared?.features || [])];
    if (features.length) fit({ type: "FeatureCollection", features });
  }
  function sample() {
    const feature = prepared?.features[pendingIndex] || prepared?.features[0];
    $("geo-sample-name").textContent = feature?.gyoda.name || "";
    $("geo-sample-desc").textContent = feature?.gyoda.description || "";
  }
  function updatePending() {
    prepared = null;
    $("geo-add").disabled = true;
    if (!pending) { draw(); return; }
    try {
      let index = 0;
      prepared = api.prepare(pending, settings(), () => pendingIds[index++]);
      api.exportText(api.append(added, prepared));
      error();
      $("geo-add").disabled = !mapReady;
    } catch (reason) { prepared = null; error(reason.message); }
    sample();
    draw();
  }
  function clearPending() {
    pending = null; prepared = null; pendingIds = []; pendingIndex = 0;
    $("geo-pending").hidden = true;
    $("geo-file-name").textContent = "";
    draw();
  }
  function renderList() {
    populate($("geo-selected"), added.features.map(feature => [feature.id, `${api.kinds[feature.geometry.type]} | ${feature.gyoda.name || "（名称未入力）"}`]), selectedId);
    $("geo-total").textContent = `${added.features.length}件`;
    $("geo-empty").hidden = added.features.length > 0;
    $("geo-detail").hidden = added.features.length === 0;
    $("geo-export").disabled = added.features.length === 0;
  }
  function showSelected(id, move = false) {
    selectedId = id;
    const feature = selected();
    renderList();
    if (feature) {
      $("geo-kind").textContent = `${api.kinds[feature.geometry.type]} / ${feature.geometry.type}`;
      $("geo-id").textContent = feature.id;
      $("geo-edit-name").value = feature.gyoda.name;
      $("geo-edit-desc").value = feature.gyoda.description;
      $("geo-edit-category").value = feature.gyoda.category;
      $("geo-edit-color").value = feature.gyoda.color;
      if (move) fit({ type: "FeatureCollection", features: [feature] });
    }
    draw();
  }
  $("geo-file").addEventListener("change", async event => {
    const file = event.target.files[0]; event.target.value = "";
    const sequence = ++fileSequence;
    if (!file) return;
    try {
      if (file.size > api.MAX_BYTES) throw new Error("ファイルは5MB以内にしてください。");
      const parsed = api.parse(await file.text());
      if (sequence !== fileSequence) return;
      if (pending && !confirm("確認待ちのファイルを置き換えますか？")) return;
      pending = parsed;
      pendingIds = parsed.collection.features.map(() => `geo-${crypto.randomUUID()}`);
      pendingIndex = 0;
      const keys = api.propertyKeys(parsed.collection);
      populate($("geo-name-key"), [["", "属性を使わず連番にする"], ...keys.map(key => [key, key])], keys.find(key => ["name", "名称", "名前", "title"].includes(key)) || "");
      populate($("geo-desc-key"), [["", "説明なし"], ...keys.map(key => [key, key])], keys.find(key => ["description", "desc", "説明"].includes(key)) || "");
      $("geo-mapping").disabled = parsed.isDraft;
      $("geo-file-name").textContent = file.name;
      $("geo-counts").textContent = `点 ${parsed.counts.点}件 / 線 ${parsed.counts.線}件 / 面 ${parsed.counts.面}件`;
      $("geo-pending").hidden = false;
      status(parsed.isDraft ? "書き出し済みデータの固定ID・名称・色を保持します。" : "確認待ちです。既存データと公開サイトは変更されていません。");
      updatePending();
      fit(prepared);
    } catch (reason) {
      if (sequence === fileSequence) error(`読み込めませんでした。${reason.message} 追加済みデータは保持されています。`);
    }
  });
  for (const id of ["geo-name-key", "geo-desc-key", "geo-category", "geo-color"]) $(id).addEventListener("change", updatePending);
  $("geo-cancel").addEventListener("click", () => { clearPending(); error(); status("読み込みをキャンセルしました。"); });
  $("geo-add").addEventListener("click", () => {
    if (!prepared || !mapReady) return;
    try {
      const next = api.append(added, prepared);
      api.exportText(next);
      const firstId = prepared.features[0].id;
      const count = prepared.features.length;
      added = next;
      clearPending();
      showSelected(firstId);
      setDirty(true);
      error();
      status(`${count}件を編集用データに追加しました。公開サイトには反映されていません。`);
    } catch (reason) { error(reason.message); }
  });
  $("geo-selected").addEventListener("change", event => showSelected(event.target.value, true));
  $("geo-detail-form").addEventListener("submit", event => event.preventDefault());
  $("geo-detail-form").addEventListener("input", () => {
    const feature = selected();
    if (!feature) return;
    Object.assign(feature.gyoda, { name: $("geo-edit-name").value, description: $("geo-edit-desc").value, category: $("geo-edit-category").value, color: $("geo-edit-color").value });
    try { api.validateMetadata(feature.gyoda); error(); } catch (reason) { error(reason.message); }
    setDirty(true); renderList(); draw();
  });
  $("geo-remove").addEventListener("click", () => {
    if (!selected() || !confirm("選択中の地物を編集用データから削除しますか？")) return;
    added.features = added.features.filter(feature => feature.id !== selectedId);
    showSelected(added.features[0]?.id || "");
    setDirty(true); error();
    if (pending) updatePending();
    status("地物を削除しました。下書きはまだ更新されていません。");
  });
  $("geo-save").addEventListener("click", () => {
    try {
      const text = api.exportText(added);
      localStorage.setItem(storageKey, text);
      setDirty(false); error();
      status(pending ? "追加済みデータを保存しました。確認待ちのファイルは保存対象外です。" : "このブラウザに下書きを保存しました。公開サイトは変更されていません。");
    } catch (reason) { error(`保存できませんでした。${reason.message}`); }
  });
  $("geo-restore").addEventListener("click", () => {
    try {
      const text = localStorage.getItem(storageKey);
      if (!text) throw new Error("このブラウザに下書きがありません。");
      const saved = JSON.parse(text);
      if (saved.gyodaEditorVersion !== 1) throw new Error("下書きのバージョンが未対応です。");
      api.validateDraft(saved);
      if ((dirty || pending) && !confirm("現在の編集内容と確認待ちファイルを保存済みの下書きに置き換えますか？")) return;
      added = { type: "FeatureCollection", features: saved.features };
      clearPending();
      showSelected(added.features[0]?.id || "");
      setDirty(false); error(); fitAll();
      status("このブラウザの下書きを復元しました。");
    } catch (reason) { error(`復元できませんでした。${reason.message}`); }
  });
  $("geo-export").addEventListener("click", () => {
    try {
      const text = api.exportText(added);
      const url = URL.createObjectURL(new Blob([text], { type: "application/geo+json" }));
      const link = document.createElement("a"); link.href = url; link.download = "gyoda-additions.geojson";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      error(); status(pending ? "追加済みデータを書き出しました。確認待ちのファイルは含まれません。" : "GeoJSONのダウンロードを開始しました。公開サイトは変更されていません。");
    } catch (reason) { error(`書き出せませんでした。${reason.message}`); }
  });
  $("geo-fit").addEventListener("click", fitAll);
  $("open-map-preview").addEventListener("click", async () => {
    const button = $("open-map-preview");
    button.disabled = true;
    try {
      if (pending) throw new Error("確認待ちのGeoJSONを追加するか、キャンセルしてから開いてください。");
      api.validateDraft(added);
      await GyodaMapPreview.open({ geojson: structuredClone(added), returnPage: "geojson.html" });
      error();
      status("追加済みGeoJSONと保存済みスポットの下書きを、別タブに表示しました。下書き・公開データは更新していません。");
    } catch (reason) { error(`プレビューを開けませんでした。${reason.message}`); }
    finally { button.disabled = false; }
  });
  window.addEventListener("beforeunload", event => { if (dirty || pending) { event.preventDefault(); event.returnValue = ""; } });

  try {
    map = new maplibregl.Map({ container: "geo-map", style: "gyoda-style.json?v=20260721-1", center: [139.47, 36.135], zoom: 12.5, attributionControl: true });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("error", () => { $("geo-map-status").hidden = false; $("geo-map-status").textContent = "背景地図の一部を読み込めません。接続を確認してください。"; });
    map.on("load", () => {
      for (const source of ["added", "pending"]) {
        map.addSource(source, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: `${source}-fill`, type: "fill", source, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": source === "pending" ? 0.25 : 0.4 } });
        map.addLayer({ id: `${source}-line`, type: "line", source, filter: ["!=", ["geometry-type"], "Point"], paint: {
          "line-color": ["get", "color"], "line-width": ["case", ["get", "selected"], 6, 3], ...(source === "pending" ? { "line-dasharray": [2, 2] } : {})
        } });
        map.addLayer({ id: `${source}-point`, type: "circle", source, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": ["get", "color"], "circle-radius": 8, "circle-stroke-color": source === "pending" ? "#334d42" : "#ffffff", "circle-stroke-width": ["case", ["get", "selected"], 4, 2] } });
      }
      mapReady = true;
      $("geo-map-status").hidden = true;
      updatePending(); draw(); fitAll();
    });
    map.on("click", event => {
      if (!mapReady) return;
      const feature = map.queryRenderedFeatures(event.point, { layers: ["pending-point", "pending-line", "pending-fill", "added-point", "added-line", "added-fill"] })[0];
      if (!feature) return;
      if (feature.source === "pending") { pendingIndex = Number(feature.properties.index); sample(); }
      else showSelected(feature.properties.featureId);
    });
    new ResizeObserver(() => map.resize()).observe($("geo-map"));
  } catch (reason) {
    $("geo-map-status").textContent = "地図を表示できません。接続とWebGLの設定を確認して再読み込みしてください。";
    error(reason.message);
  }
})();
