(function () {
  "use strict";
  function mount({ getSpot, getBaseline, getClient, requireAdmin, run, status }) {
    const data = GyodaPublicationData;
    const $ = id => document.getElementById(id);
    const dialog = $("publication-dialog");
    let review = null, accessId = null, accessEpoch = 0, photoUrl = null;
    const attempts = new Map();
    function releasePhoto() {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = null;
    }
    function discard() { review = null; releasePhoto(); if (dialog.open) dialog.close(); }
    function setAccess(user, busy) {
      const nextId = user?.id || null;
      if (nextId !== accessId) { accessEpoch++; discard(); attempts.clear(); accessId = nextId; }
      $("publication-actions").hidden = !user;
      for (const id of ["publication-review", "publication-undo", "publication-confirm"]) $(id).disabled = busy || !user;
    }
    function checkContext(id, epoch) {
      if (id !== getSpot().id || epoch !== accessEpoch || !accessId) throw new Error("スポットまたはログイン状態が変わりました。再確認してください。");
    }
    async function read(table, columns, id) {
      const result = await getClient().from(table).select(columns).eq("spot_id", id).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }
    async function prepare(mode) {
      discard();
      const id = getSpot().id, epoch = accessEpoch;
      await requireAdmin();
      checkContext(id, epoch);
      status("保存済みの内容と公開状態を確認中…");
      const state = await read("spot_publication_state", "spot_id,revision,previous_content,undo_available", id);
      const revision = state?.revision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("公開状態が不正です。");
      const published = await read("spot_content_published", data.columns, id);
      const baseline = getBaseline(id);
      const current = published ? data.validate(published) : data.fromSpot(baseline);
      let candidate, usesStatic = false, choice = null, photoBlob = null;
      if (mode === "publish") {
        const draft = await read("spot_content_drafts", data.columns, id);
        if (!draft) throw new Error("先に選択中のスポットをオンライン保存してください。");
        candidate = data.validate(draft);
        choice = await read("spot_photo_drafts", "spot_id,object_name,revision", id);
        if (choice?.object_name) {
          const prefix = id + "/";
          if (!choice.object_name.startsWith(prefix) || !Number.isSafeInteger(choice.revision) || choice.revision < 1) throw new Error("写真の指定が不正です。");
          GyodaPrivatePhotos.objectPath(id, choice.object_name.slice(prefix.length));
          const photo = await getClient().storage.from("gyoda-private-photos").download(choice.object_name);
          if (photo.error || !(photo.data instanceof Blob) || !["image/jpeg","image/png","image/webp"].includes(photo.data.type) || photo.data.size > 5242880) throw new Error("公開候補の写真を取得できませんでした。写真は公開していません。");
          photoBlob = photo.data;
        }
      } else {
        if (!state?.undo_available) throw new Error("取り消せる公開はありません。");
        usesStatic = state.previous_content === null;
        candidate = usesStatic ? data.fromSpot(baseline) : data.validate(state.previous_content);
      }
      checkContext(id, epoch);
      if (current.spot_id !== id || candidate.spot_id !== id) throw new Error("取得したスポットIDが一致しません。");
      const snapshot = JSON.stringify({ id, revision, candidate, choice });
      if (photoBlob && !attempts.has(snapshot)) attempts.set(snapshot, crypto.randomUUID());
      review = { id, epoch, revision, candidate, mode, choice, requestId:attempts.get(snapshot) };
      $("publication-title").textContent = mode === "publish" ? "保存済み下書きを公開" : "直前の公開を取り消す";
      $("publication-target").textContent = `${candidate.name} (${id})`;
      $("publication-note").textContent = mode === "publish"
        ? "対象は保存済みのオンライン下書きです。画面の未保存の入力は含まれません。"
        : usesStatic ? "初回公開を取り消し、元のJSONのカード情報に戻します。下書きは変更しません。" : "直前の公開内容へ戻します。下書きは変更しません。";
      if (photoBlob) $("publication-note").textContent += " 下の写真を公開用にコピーします。公開してよい写真であることを確認してください。一度公開した画像は第三者の保存先から回収できません。";
      if (mode === "undo") $("publication-note").textContent += " 公開済み画像そのものは削除されません。";
      const rows = Object.entries(data.fields).map(([column, field]) => {
        const tr = document.createElement("tr");
        for (const value of [GyodaSpotData.labels[field], current[column] || "（空欄）", column === "photo" && photoBlob ? "選択した非公開写真（下に表示）" : candidate[column] || "（空欄）"]) {
          const td = document.createElement("td"); td.textContent = value; tr.appendChild(td);
        }
        if (current[column] !== candidate[column] || column === "photo" && photoBlob) tr.className = "publication-changed";
        return tr;
      });
      $("publication-diff").replaceChildren(...rows);
      $("publication-card").innerHTML = buildPopupHtml(data.apply(baseline, photoBlob ? { ...candidate, photo:"" } : candidate), { preview: true });
      if (photoBlob) {
        photoUrl = URL.createObjectURL(photoBlob);
        const img = document.createElement("img");
        img.src = photoUrl; img.alt = `${candidate.name}の公開候補の写真`;
        img.style.cssText = "display:block;max-width:100%;width:100%;max-height:280px;object-fit:contain";
        img.addEventListener("error", () => { discard(); status("写真を表示できないため公開確認を中止しました。", true); });
        $("publication-card").prepend(img);
      }
      $("publication-confirm").textContent = mode === "publish" ? "この内容を公開する" : "この内容に戻す";
      dialog.showModal();
      status("確認画面を開きました。まだ公開内容は変更していません。");
    }
    $("publication-review").addEventListener("click", () => run(() => prepare("publish")));
    $("publication-undo").addEventListener("click", () => run(() => prepare("undo")));
    $("publication-cancel").addEventListener("click", discard);
    dialog.addEventListener("close", () => { if (!dialog.open) { review = null; releasePhoto(); } });
    window.addEventListener("pagehide", discard);
    $("spot-select").addEventListener("change", discard);
    $("publication-confirm").addEventListener("click", () => run(async () => {
      const pending = review;
      if (!pending) throw new Error("内容を再確認してください。");
      // Photo retries retain the immutable snapshot and request ID after a lost response.
      if (!pending.choice?.object_name || pending.mode !== "publish") discard();
      await requireAdmin();
      checkContext(pending.id, pending.epoch);
      if (pending.mode === "publish" && pending.choice?.object_name) {
        status("写真を公開用にコピーして、カード情報を更新中…");
        const result = await getClient().functions.invoke("publish-spot-photo", { body:{
          request_id:pending.requestId, spot_id:pending.id, expected_revision:pending.revision,
          expected_draft:pending.candidate, expected_photo_revision:pending.choice.revision,
          expected_source:pending.choice.object_name
        } });
        if (result.error) {
          const code = result.error.context?.status;
          if ([400,401,403,409].includes(code)) {
            for (const [snapshot, requestId] of attempts) if (requestId === pending.requestId) attempts.delete(snapshot);
            discard();
            throw new Error("公開できませんでした。ログイン状態と下書き・写真の指定を確認し、公開内容をもう一度確認してください。");
          }
          throw new Error("公開結果を確認できませんでした。同じ確認画面の公開ボタンで再試行できます。再読み込みせず通信状態を確認してください。");
        }
        if (result.data?.status !== "completed" || result.data.result?.spot_id !== pending.id) throw new Error("公開結果を確認できませんでした。同じ確認画面で再試行してください。");
        discard();
        status(`${pending.candidate.name} の写真とカードを公開しました。利用者マップを再読み込みしてください。`);
        return;
      }
      const args = { p_spot_id: pending.id, p_expected_revision: pending.revision };
      if (pending.mode === "publish") args.p_expected_draft = pending.candidate;
      const result = await getClient().rpc(pending.mode === "publish" ? "publish_spot_card" : "undo_spot_publication", args);
      if (result.error) {
        if (result.error.code === "40001") throw new Error("下書きまたは公開内容が変わりました。もう一度内容を確認してください。");
        throw new Error("公開操作を確認できませんでした。通信・権限を確認し、公開内容を再取得してください。" + (result.error.message || ""));
      }
      if (result.data?.spot_id !== pending.id) throw new Error("応答を確認できませんでした。公開内容を再取得してください。");
      status(pending.mode === "publish"
        ? `${pending.candidate.name} を公開しました。利用者マップを再読み込みすると反映されます。`
        : `${pending.candidate.name} の公開を取り消しました。利用者マップを再読み込みしてください。`);
    }));
    return { setAccess };
  }
  window.GyodaPublication = { mount };
})();
