(function (root) {
  "use strict";
  const MAX_FEATURES = 1000;
  const MAX_POSITIONS = 100000;
  const MAX_BYTES = 5 * 1024 * 1024;
  const kinds = { Point: "点", MultiPoint: "点", LineString: "線", MultiLineString: "線", Polygon: "面", MultiPolygon: "面" };
  const categories = {
    sightseeing: "観光施設", food: "飲食店", station: "駅", onsen: "温泉", souvenir: "お土産",
    route: "観光ルート", area: "観光エリア", other: "その他"
  };
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function fail(message) { throw new Error(message); }
  function checkCrs(object) {
    if (!Object.hasOwn(object, "crs")) return;
    const name = object.crs?.properties?.name;
    if (!["EPSG:4326", "urn:ogc:def:crs:OGC:1.3:CRS84", "urn:ogc:def:crs:EPSG::4326"].includes(name)) {
      fail("座標系が未対応です。WGS84の経度・緯度（EPSG:4326）で書き出してください。");
    }
  }
  function normalize(input, { allowEmpty = false } = {}) {
    if (!isObject(input)) fail("GeoJSONのオブジェクトを選んでください。");
    checkCrs(input);
    let source;
    if (input.type === "FeatureCollection") source = input.features;
    else if (input.type === "Feature") source = [input];
    else if (Object.hasOwn(kinds, input.type)) source = [{ type: "Feature", properties: {}, geometry: input }];
    else fail("点・線・面のGeoJSONに対応しています。GeometryCollectionなどは分割して読み込んでください。");
    if (!Array.isArray(source) || source.length > MAX_FEATURES || (!allowEmpty && source.length === 0)) fail(`地物は1〜${MAX_FEATURES}件まで読み込めます。`);
    let positionCount = 0;
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    const counts = { 点: 0, 線: 0, 面: 0 };
    const position = value => {
      if (!Array.isArray(value) || ![2, 3].includes(value.length) || !value.every(Number.isFinite)) fail("座標は経度・緯度（必要なら標高）の数値で指定してください。");
      if (Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) fail("座標の範囲が不正です。経度・緯度の順序と座標系を確認してください。");
      if (++positionCount > MAX_POSITIONS) fail(`座標点は合計${MAX_POSITIONS}点までです。データを分割してください。`);
      bounds[0] = Math.min(bounds[0], value[0]); bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]); bounds[3] = Math.max(bounds[3], value[1]);
    };
    const sequence = (value, min, visit) => {
      if (!Array.isArray(value) || value.length < min) fail("図形に必要な座標数が足りません。");
      value.forEach(visit);
    };
    const line = value => sequence(value, 2, position);
    const ring = value => {
      sequence(value, 4, position);
      const first = value[0], last = value[value.length - 1];
      if (first.length !== last.length || !first.every((number, index) => number === last[index])) fail("面の外周・穴の始点と終点を同じ座標にしてください。");
    };
    const polygon = value => sequence(value, 1, ring);
    const readers = {
      Point: position, MultiPoint: value => sequence(value, 1, position), LineString: line,
      MultiLineString: value => sequence(value, 1, line), Polygon: polygon,
      MultiPolygon: value => sequence(value, 1, polygon)
    };
    const features = source.map((feature, index) => {
      try {
        if (!isObject(feature) || feature.type !== "Feature") fail("Feature形式ではありません。");
        checkCrs(feature);
        const geometry = feature.geometry;
        if (!isObject(geometry) || !Object.hasOwn(readers, geometry.type)) fail("空の形状、GeometryCollection、未対応の図形は読み込めません。");
        checkCrs(geometry);
        if (feature.properties !== null && !isObject(feature.properties)) fail("propertiesはオブジェクトまたはnullで指定してください。");
        if (Object.hasOwn(feature, "id") && !(typeof feature.id === "string" || (typeof feature.id === "number" && Number.isFinite(feature.id)))) fail("地物IDの形式が不正です。");
        readers[geometry.type](geometry.coordinates);
        counts[kinds[geometry.type]]++;
        return structuredClone(feature);
      } catch (error) { fail(`${index + 1}件目: ${error.message}`); }
    });
    return { collection: { type: "FeatureCollection", features }, counts, bounds: source.length ? bounds : null, positionCount };
  }
  function parse(text) {
    if (new TextEncoder().encode(text).length > MAX_BYTES) fail("ファイルは5MB以内にしてください。");
    let object;
    try { object = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { fail("JSONの書式が正しくありません。"); }
    const result = normalize(object);
    result.isDraft = object.gyodaEditorVersion === 1;
    if (Object.hasOwn(object, "gyodaEditorVersion") && !result.isDraft) fail("この編集データのバージョンには対応していません。");
    if (result.isDraft) validateDraft(result.collection);
    return result;
  }
  function propertyKeys(collection) {
    const keys = new Set();
    for (const feature of collection.features) {
      for (const [key, value] of Object.entries(feature.properties || {})) {
        if (["string", "number", "boolean"].includes(typeof value)) keys.add(key);
      }
    }
    return [...keys].sort();
  }
  function propertyText(feature, key) {
    if (!key || !Object.hasOwn(feature.properties || {}, key)) return "";
    const value = feature.properties[key];
    return ["string", "number", "boolean"].includes(typeof value) ? String(value) : "";
  }
  function validateMetadata(meta) {
    if (!isObject(meta) || typeof meta.name !== "string" || !meta.name.trim() || meta.name.length > 100) fail("名称は1〜100文字で入力してください。");
    if (typeof meta.description !== "string" || meta.description.length > 3000) fail("説明は3000文字以内で入力してください。");
    if (!Object.hasOwn(categories, meta.category)) fail("カテゴリが不正です。");
    if (!/^#[0-9a-fA-F]{6}$/.test(meta.color)) fail("表示色が不正です。");
  }
  function validateDraft(collection) {
    normalize(collection, { allowEmpty: true });
    const ids = new Set();
    for (const feature of collection.features) {
      if (typeof feature.id !== "string" || !/^geo-[a-zA-Z0-9-]{1,80}$/.test(feature.id) || ids.has(feature.id)) fail("固定IDが不正、または重複しています。");
      ids.add(feature.id);
      validateMetadata(feature.gyoda);
    }
    return collection;
  }
  function prepare(parsed, settings, makeId = () => `geo-${crypto.randomUUID()}`) {
    if (parsed.isDraft) return structuredClone(validateDraft(parsed.collection));
    const features = parsed.collection.features.map((feature, index) => {
      const name = propertyText(feature, settings.nameKey) || `${kinds[feature.geometry.type]} ${index + 1}`;
      const description = propertyText(feature, settings.descriptionKey);
      const gyoda = { name, description, category: settings.category, color: settings.color };
      if (Object.hasOwn(feature, "id")) gyoda.sourceId = feature.id;
      if (Object.hasOwn(feature, "gyoda")) gyoda.sourceGyoda = structuredClone(feature.gyoda);
      const output = { ...structuredClone(feature), id: makeId(), gyoda };
      validateMetadata(gyoda);
      return output;
    });
    return validateDraft({ type: "FeatureCollection", features });
  }
  function append(current, incoming) {
    validateDraft(current); validateDraft(incoming);
    const ids = new Set(current.features.map(feature => feature.id));
    if (incoming.features.some(feature => ids.has(feature.id))) fail("すでに追加済みの固定IDが含まれています。上書きは行いません。");
    return validateDraft({ type: "FeatureCollection", features: [...current.features, ...structuredClone(incoming.features)] });
  }
  function exportText(collection) {
    validateDraft(collection);
    const text = JSON.stringify({ ...collection, gyodaEditorVersion: 1 }, null, 2) + "\n";
    if (new TextEncoder().encode(text).length > MAX_BYTES) fail("書き出し結果が5MBを超えます。地物を減らしてください。");
    return text;
  }
  const api = { MAX_BYTES, kinds, categories, parse, normalize, propertyKeys, propertyText, prepare, append, validateDraft, validateMetadata, exportText };
  root.GyodaGeoJSON = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
