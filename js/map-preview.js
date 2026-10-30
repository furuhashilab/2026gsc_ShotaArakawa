(function (root) {
  "use strict";
  const key = "gyoda-map-preview-v1";
  const spotDraftKey = "gyoda-spot-editor-draft-v1";
  const geoDraftKey = "gyoda-geojson-editor-draft-v1";
  const empty = () => ({ type: "FeatureCollection", features: [] });
  function validate(snapshot, baseline) {
    if (!snapshot || snapshot.version !== 1 || !/^preview-[a-zA-Z0-9-]+$/.test(snapshot.id) || !["editor.html", "geojson.html"].includes(snapshot.returnPage)) throw new Error("プレビューデータの形式が不正です。");
    const spots = root.GyodaSpotData.mergeEditable(baseline, snapshot.spots);
    const geojson = root.GyodaGeoJSON.validateDraft(snapshot.geojson);
    root.GyodaGeoJSON.exportText(geojson);
    return { ...snapshot, spots, geojson };
  }
  function read(baseline, search = root.location.search, storage) {
    const params = new URLSearchParams(search);
    if (!params.has("preview")) return null;
    storage ??= root.localStorage;
    const snapshot = JSON.parse(storage.getItem(key) || "null");
    if (!snapshot || snapshot.id !== params.get("preview")) throw new Error("このプレビューは見つからないか、別のプレビューに更新されました。管理画面から開き直してください。");
    return validate(snapshot, baseline);
  }
  async function open({ spots, geojson, returnPage }) {
    const popup = root.open("about:blank", "_blank");
    if (!popup) throw new Error("ポップアップがブロックされました。このサイトのポップアップを許可してください。");
    popup.opener = null;
    popup.document.title = "プレビューを準備中";
    popup.document.body.textContent = "プレビューを準備しています。";
    try {
      const baseline = await root.GyodaSpotData.load();
      if (spots === undefined) {
        const text = root.localStorage.getItem(spotDraftKey);
        if (text) {
          const draft = JSON.parse(text);
          if (draft.version !== 1) throw new Error("スポットの下書きが未対応の形式です。");
          spots = draft.spots;
        } else spots = baseline;
      }
      if (geojson === undefined) {
        const text = root.localStorage.getItem(geoDraftKey);
        if (text) {
          geojson = JSON.parse(text);
          if (geojson.gyodaEditorVersion !== 1) throw new Error("GeoJSONの下書きが未対応の形式です。");
        } else geojson = empty();
      }
      const snapshot = validate({ version: 1, id: `preview-${crypto.randomUUID()}`, createdAt: new Date().toISOString(), returnPage, spots, geojson }, baseline);
      root.localStorage.setItem(key, JSON.stringify(snapshot));
      const url = new URL("index.html", root.location.href);
      url.searchParams.set("preview", snapshot.id);
      popup.location.replace(url.href);
    } catch (error) {
      popup.close();
      throw error;
    }
  }
  function banner(snapshot) {
    document.body.classList.add("map-preview");
    const bar = document.createElement("aside");
    bar.className = "map-preview-banner";
    bar.setAttribute("aria-label", "未公開プレビュー");
    const label = document.createElement("strong"); label.textContent = "未公開プレビュー";
    const counts = document.createElement("span"); counts.textContent = `スポット ${snapshot.spots.length}件 / 追加 ${snapshot.geojson.features.length}件`;
    const fit = document.createElement("button"); fit.type = "button"; fit.id = "preview-fit-additions"; fit.textContent = "追加範囲を表示"; fit.disabled = true;
    const close = document.createElement("button"); close.type = "button"; close.textContent = "プレビューを閉じる"; close.addEventListener("click", () => root.close());
    const back = document.createElement("a"); back.href = snapshot.returnPage; back.textContent = "管理画面";
    bar.append(label, counts, fit, close, back);
    document.body.prepend(bar);
    const measure = () => document.documentElement.style.setProperty("--map-preview-offset", `${bar.getBoundingClientRect().height}px`);
    new ResizeObserver(measure).observe(bar);
    measure();
  }
  const layerIds = ["preview-added-point", "preview-added-line", "preview-added-fill"];
  function install(map, snapshot) {
    const collection = snapshot.geojson;
    if (!collection.features.length) return;
    const rendered = { type: "FeatureCollection", features: collection.features.map(feature => ({ type: "Feature", geometry: feature.geometry, properties: { id: feature.id, color: feature.gyoda.color } })) };
    map.addSource("preview-additions", { type: "geojson", data: rendered });
    map.addLayer({ id: "preview-added-fill", type: "fill", source: "preview-additions", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 } });
    map.addLayer({ id: "preview-added-line", type: "line", source: "preview-additions", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": ["get", "color"], "line-width": 4 } });
    map.addLayer({ id: "preview-added-point", type: "circle", source: "preview-additions", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": ["get", "color"], "circle-radius": 10, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 } });
    for (const id of layerIds) {
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    }
    const fit = () => {
      const bounds = root.GyodaGeoJSON.normalize(collection).bounds;
      const mobile = root.matchMedia("(max-width: 760px)").matches;
      map.fitBounds([[bounds[0],bounds[1]],[bounds[2],bounds[3]]], { padding: mobile ? { top: 120, bottom: 80, left: 30, right: 30 } : { top: 130, bottom: 60, left: 285, right: 310 }, maxZoom: 14.5, duration: 600 });
    };
    const button = document.getElementById("preview-fit-additions");
    button.disabled = false; button.addEventListener("click", fit);
    fit();
  }
  function pick(map, point, snapshot) {
    if (!snapshot) return null;
    const layers = layerIds.filter(id => map.getLayer(id));
    if (!layers.length) return null;
    const hits = map.queryRenderedFeatures([[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]], { layers });
    const hit = hits.find(feature => feature.layer.id === "preview-added-point") || hits.find(feature => feature.layer.id === "preview-added-line") || hits[0];
    return hit ? snapshot.geojson.features.find(feature => feature.id === hit.properties.id) || null : null;
  }
  const api = { key, validate, read, open, banner, install, pick };
  root.GyodaMapPreview = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
