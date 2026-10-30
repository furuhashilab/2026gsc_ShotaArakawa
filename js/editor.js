(async function () {
  "use strict";
  const data = GyodaSpotData;
  const $ = id => document.getElementById(id);
  const storageKey = "gyoda-spot-editor-draft-v1";
  let baseline = [];
  let spots = [];
  let selectedId = "";
  let dirty = false;
  let previewKey = "";
  let previewTimer;
  const selectedSpot = () => spots.find(spot => spot.id === selectedId);
  function status(text) { $("editor-status").textContent = text; }
  function error(text = "") {
    $("editor-error").textContent = text;
    $("editor-error").hidden = !text;
  }
  function setDirty(value) {
    dirty = value;
    $("save-state").textContent = value ? "未保存の変更あり" : "未保存の変更なし";
  }
  function renderOptions() {
    $("spot-select").replaceChildren(...spots.map(spot => {
      const option = document.createElement("option");
      option.value = spot.id;
      option.textContent = spot.name || "（名称未入力）";
      return option;
    }));
    $("spot-select").value = selectedId;
  }
  function renderPreview() {
    const spot = selectedSpot();
    const key = JSON.stringify([spot.id, spot.photo, spot.youtube2, spot.youtube, spot.homepage]);
    const preview = $("card-preview");
    if (key !== previewKey) {
      preview.innerHTML = buildPopupHtml(spot, { preview: true });
      previewKey = key;
      $("media-warning").textContent = "";
      const img = preview.querySelector("img");
      if (img) img.addEventListener("error", () => {
        $("media-warning").textContent = "写真を読み込めません。URLと画像の公開設定を確認してください。";
      });
    } else {
      preview.querySelector(".popup-title").textContent = spot.name;
      const img = preview.querySelector("img");
      if (img) img.alt = spot.name;
      let desc = preview.querySelector(".popup-desc");
      if (!desc) {
        desc = document.createElement("div");
        desc.className = "popup-desc";
        preview.querySelector(".popup-title").after(desc);
      }
      desc.textContent = spot.desc || "";
      desc.hidden = !spot.desc;
    }
  }
  function validateFields() {
    let valid = true;
    for (const key of data.fields) {
      const input = $("edit-" + key);
      const message = data.fieldError(key, input.value);
      input.setCustomValidity(message);
      input.setAttribute("aria-invalid", String(Boolean(message)));
      $("error-" + key).textContent = message;
      if (message) valid = false;
    }
    return valid;
  }
  function selectSpot(id) {
    selectedId = id;
    const spot = selectedSpot();
    for (const key of data.fields) $("edit-" + key).value = spot[key] || "";
    $("spot-id").textContent = spot.id;
    $("spot-category").textContent = data.categories[spot.category].label;
    $("spot-category").style.setProperty("--category-color", data.categories[spot.category].color);
    validateFields();
    renderPreview();
  }
  function checkedData() {
    validateFields();
    return data.mergeEditable(baseline, spots);
  }
  function replaceData(next, message, changed) {
    if (dirty && !window.confirm("未保存の編集内容を置き換えますか？")) return;
    spots = next;
    renderOptions();
    selectSpot(selectedId);
    setDirty(changed);
    error();
    status(message);
  }

  window.addEventListener("beforeunload", event => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
  $("spot-form").addEventListener("submit", event => event.preventDefault());
  $("spot-form").addEventListener("input", event => {
    const key = event.target.name;
    if (!data.fields.includes(key)) return;
    const spot = selectedSpot();
    if (!event.target.value && key !== "name") delete spot[key];
    else spot[key] = event.target.value;
    setDirty(true);
    error();
    status("");
    validateFields();
    if (key === "name") renderOptions();
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 250);
  });
  $("spot-select").addEventListener("change", event => selectSpot(event.target.value));
  $("open-map-preview").addEventListener("click", async () => {
    const button = $("open-map-preview");
    button.disabled = true;
    try {
      const valid = checkedData();
      await GyodaMapPreview.open({ spots: valid, returnPage: "editor.html" });
      error();
      status("編集中のスポットと保存済みGeoJSONの下書きを、別タブに表示しました。下書き・公開データは更新していません。");
    } catch (reason) { error(`プレビューを開けませんでした。${reason.message}`); }
    finally { button.disabled = false; }
  });
  $("reset-spot").addEventListener("click", () => {
    if (!window.confirm("このスポットの編集を破棄し、読み込み元の内容に戻しますか？")) return;
    const index = spots.findIndex(spot => spot.id === selectedId);
    spots[index] = structuredClone(baseline.find(spot => spot.id === selectedId));
    renderOptions();
    selectSpot(selectedId);
    setDirty(true);
    error();
    status("選択中のスポットを元に戻しました。下書きはまだ更新されていません。");
  });
  $("save-draft").addEventListener("click", () => {
    try {
      const valid = checkedData();
      localStorage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), spots: valid }));
      setDirty(false);
      $("restore-draft").disabled = false;
      error();
      status("このブラウザに下書きを保存しました。公開サイトは変更されていません。");
    } catch (reason) { error(`保存できませんでした。${reason.message}`); }
  });
  $("restore-draft").addEventListener("click", () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved || saved.version !== 1) throw new Error("対応する下書きがありません。");
      const next = data.mergeEditable(baseline, saved.spots);
      replaceData(next, "このブラウザの下書きを復元しました。公開サイトは変更されていません。", false);
    } catch (reason) { error(`復元できませんでした。${reason.message}`); }
  });
  $("export-data").addEventListener("click", () => {
    try {
      const valid = checkedData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(valid, null, 2) + "\n"], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "spots.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      error();
      status("JSONのダウンロードを開始しました。公開サイトへの反映はまだ行われていません。");
    } catch (reason) { error(`書き出せませんでした。${reason.message}`); }
  });
  $("import-data").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async event => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("ファイルは2MB以内にしてください。");
      const next = data.mergeEditable(baseline, JSON.parse(await file.text()));
      replaceData(next, "ファイルを読み込みました。下書きはまだ保存されていません。", true);
    } catch (reason) { error(`読み込めませんでした。現在の編集内容は保持されています。${reason.message}`); }
  });
  for (const mode of ["edit", "preview"]) {
    $("tab-" + mode).addEventListener("click", () => {
      $("editor-layout").classList.toggle("show-preview", mode === "preview");
      $("tab-edit").setAttribute("aria-pressed", String(mode === "edit"));
      $("tab-preview").setAttribute("aria-pressed", String(mode === "preview"));
      if (mode === "preview") renderPreview();
    });
  }
  try {
    baseline = await data.load();
    spots = structuredClone(baseline);
    selectedId = spots[0].id;
    renderOptions();
    selectSpot(selectedId);
    $("spot-total").textContent = `${spots.length}件`;
    $("editor-layout").hidden = false;
    for (const id of ["save-draft", "import-data", "export-data", "open-map-preview"]) $(id).disabled = false;
    setDirty(false);
    if (window.GyodaCloudDrafts) GyodaCloudDrafts.mount({
      getSpot: () => structuredClone(selectedSpot()),
      getBaseline: id => structuredClone(baseline.find(spot => spot.id === id)),
      applyDraft: draft => {
        if (selectedId !== draft.spot_id) return false;
        const spot = selectedSpot();
        spot.name = draft.name;
        spot.desc = draft.description;
        for (const field of ["photo", "youtube2", "youtube", "homepage"]) {
          if (draft[field] == null) continue;
          if (draft[field] === "") delete spot[field];
          else spot[field] = draft[field];
        }
        renderOptions();
        selectSpot(selectedId);
        setDirty(true);
        return true;
      }
    });
    try {
      $("restore-draft").disabled = !localStorage.getItem(storageKey);
      if (!$("restore-draft").disabled) status("このブラウザに保存された下書きがあります。");
    } catch { status("ブラウザ内保存を利用できません。JSONの書き出しは利用できます。"); }
  } catch (reason) {
    $("save-state").textContent = "読み込み失敗";
    error(`スポット情報を読み込めませんでした。${reason.message} ページを再読み込みしてください。`);
  }
})();
