(function (root) {
  "use strict";
  const bucket = "gyoda-private-photos";
  const types = ["image/jpeg", "image/png", "image/webp"];
  const namePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
  function validateFile(file) {
    if (!file || !types.includes(file.type)) throw new Error("JPEG・PNG・WebPを選んでください。HEICはJPEGに変換してから選んでください。");
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("写真は20MB以内にしてください。");
  }
  function dimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 40000000) throw new Error("画像が大きすぎます。4000万画素以内の画像を選んでください。");
    const scale = Math.min(1, 1600 / Math.max(width, height));
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }
  async function prepare(file) {
    validateFile(file);
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { throw new Error("写真を読み取れませんでした。別のJPEG・PNG・WebPで試してください。"); }
    const canvas = document.createElement("canvas");
    try {
      const size = dimensions(bitmap.width, bitmap.height);
      canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("このブラウザでは画像を変換できません。");
      context.drawImage(bitmap, 0, 0, size.width, size.height);
      // Re-encode pixels rather than uploading the original file/EXIF metadata.
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!blob || !types.includes(blob.type) || blob.size > 5 * 1024 * 1024) throw new Error("画像を5MB以内に変換できませんでした。小さい画像を選んでください。");
      const extension = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" }[blob.type];
      return { blob, extension, ...size };
    } finally { bitmap.close(); canvas.width = canvas.height = 1; }
  }
  function objectPath(id, filename) {
    if (!/^spot-[0-9]{3,}$/.test(id) || !namePattern.test(filename)) throw new Error("写真の保存先が不正です。");
    return `${id}/${filename}`;
  }
  function mount({ getSpot, getClient, requireAdmin, run }) {
    const $ = id => document.getElementById(id);
    let userId = null, busy = false, epoch = 0, prepared = null, blobUrl = null;
    let offset = 0, more = false, uploadPath = null, viewedPath = null;
    let inventoryOffset = 0, inventoryMore = false;
    let deletionReview = null, deletionUrl = null;
    const deletionDialog = $("photo-delete-dialog");
    function closeDeletion() {
      deletionReview = null;
      $("photo-delete-image").removeAttribute("src"); $("photo-delete-image").hidden = true;
      if (deletionUrl) URL.revokeObjectURL(deletionUrl);
      deletionUrl = null;
      if (deletionDialog.open) deletionDialog.close();
    }
    const image = $("private-photo-image");
    function status(text, failed = false) {
      $("private-photo-status").textContent = text;
      $("private-photo-status").dataset.error = String(failed);
    }
    function clearImage() {
      viewedPath = null;
      image.removeAttribute("src"); image.hidden = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
    function show(blob, alt) {
      clearImage();
      blobUrl = URL.createObjectURL(blob);
      image.alt = alt; image.src = blobUrl; image.hidden = false;
    }
    function reset() {
      closeDeletion();
      inventoryOffset = 0; inventoryMore = false;
      $("photo-inventory-list").replaceChildren();
      $("photo-inventory-status").textContent = "未取得";
      $("photo-inventory-status").dataset.error = "false";
      epoch++; prepared = null; uploadPath = null; offset = 0; more = false;
      clearImage();
      $("private-photo-file").value = "";
      $("private-photo-list").replaceChildren(new Option("写真を選択", ""));
      $("private-photo-target").textContent = `${getSpot().name} (${getSpot().id})`;
      status(userId ? "非公開写真の一覧は未取得です。" : "管理者ログインが必要です。");
    }
    function render() {
      $("private-photo-file").disabled = !userId || busy;
      $("private-photo-upload").disabled = !userId || busy || !prepared;
      $("private-photo-refresh").disabled = !userId || busy;
      $("private-photo-more").hidden = !more;
      $("private-photo-more").disabled = !userId || busy;
      $("private-photo-list").disabled = !userId || busy || $("private-photo-list").options.length <= 1;
      $("private-photo-clear").disabled = busy || !blobUrl;
      $("private-photo-choose").disabled = !userId || busy || !viewedPath;
      $("private-photo-use-url").disabled = !userId || busy;
      $("photo-inventory-refresh").disabled = !userId || busy;
      $("photo-inventory-more").hidden = !inventoryMore;
      $("photo-inventory-more").disabled = !userId || busy;
      for (const button of $("photo-inventory-list").querySelectorAll("button")) button.disabled = !userId || busy;
      $("photo-delete-confirm").disabled = !userId || busy || !deletionReview || !$("photo-delete-ack").checked;
      $("photo-delete-cancel").disabled = busy;
      $("photo-delete-ack").disabled = busy;
    }
    function setAccess(user, isBusy) {
      const nextId = user?.id || null;
      busy = isBusy;
      if (nextId !== userId) { userId = nextId; reset(); }
      render();
    }
    function context() { return { id: getSpot().id, name: getSpot().name, epoch }; }
    function current(ctx) { return Boolean(userId) && ctx.epoch === epoch && ctx.id === getSpot().id; }
    async function authorize(ctx) {
      await requireAdmin();
      if (!current(ctx)) throw new Error("スポットまたはログイン状態が変わりました。もう一度操作してください。");
    }
    function task(action) {
      const ctx = context();
      return run(async () => {
        try { await action(ctx); }
        catch (error) { if (current(ctx)) status(error.message || "処理できませんでした。通信状態を確認してください。", true); }
      });
    }
    const storage = () => getClient().storage.from(bucket);
    async function inventory(ctx, next) {
      const message = $("photo-inventory-status");
      try {
        await authorize(ctx);
        message.textContent = "使用状況を取得中…";
        message.dataset.error = "false";
        const start = next ? inventoryOffset : 0;
        if (!next) { $("photo-inventory-list").replaceChildren(); inventoryMore = false; }
        const result = await getClient().rpc("list_spot_photo_inventory", { p_spot_id:ctx.id, p_offset:start });
        if (!current(ctx)) return;
        if (result.error) throw new Error(result.error.code === "PGRST202" || result.error.code === "42883"
          ? "使用状況の取得には07-photo-inventory.sqlの登録が必要です。"
          : "使用状況を取得できませんでした。ログイン・通信状態を確認してください。");
        const value = result.data;
        if (value?.spot_id !== ctx.id || value.offset !== start || !Array.isArray(value.items) || value.items.length > 50 || typeof value.has_more !== "boolean") throw new Error("使用状況の形式が不正です。");
        const privatePending = value.pending_deletions ?? [];
        const publicPending = value.pending_cleanups ?? [];
        if (![privatePending,publicPending].every(rows => Array.isArray(rows) && rows.length <= 50)) throw new Error("削除履歴の形式が不正です。");
        const pending = [...privatePending.map(item => ({...item,bucket})), ...publicPending.map(item => ({...item,bucket:"gyoda-published-photos"}))];
        const seen = new Set([...$("photo-inventory-list").children].map(row => row.dataset.key));
        const visible = [...value.items];
        for (const item of pending) {
          if (typeof item.object_name !== "string" || !item.object_name.startsWith(ctx.id + "/")) throw new Error("削除履歴の保存先が不正です。");
          if (!visible.some(row => row.bucket === item.bucket && row.path === item.object_name)) visible.push({bucket:item.bucket,path:item.object_name,uses:[],tracked:true,can_delete:item.bucket===bucket,can_cleanup:item.bucket!==bucket,deletion_status:item.bucket===bucket?"pending":null,cleanup_status:item.bucket!==bucket?"pending":null,created_at:item.requested_at});
        }
        const rows = visible.filter(row => !seen.has(row.bucket + "/" + row.path)).map(row => {
          if (![bucket,"gyoda-published-photos"].includes(row.bucket) || typeof row.path !== "string" || !row.path.startsWith(ctx.id + "/") || !Array.isArray(row.uses)) throw new Error("写真情報の形式が不正です。");
          const privatePhoto = row.bucket === bucket;
          const labels = {candidate:"公開候補",published:privatePhoto ? "公開中の元写真" : "公開中",undo:privatePhoto ? "取り消し用の元写真" : "取り消し用",draft:"下書きで使用",pending:"公開処理中"};
          const uses = row.uses.map(use => labels[use] || "要確認");
          if (row.deletion_status === "pending") uses.unshift("削除処理の再確認が必要");
          if (row.cleanup_status === "pending") uses.unshift("コピー整理の再確認が必要");
          if (row.has_publication_history && !uses.length) uses.push("公開履歴あり・保護中");
          if (!row.tracked) uses.push("履歴を確認できない写真");
          if (!uses.length) uses.push(row.failed_copy ? "公開失敗のコピー・整理候補" : "未使用候補");
          const li = document.createElement("li");
          li.dataset.key = row.bucket + "/" + row.path;
          const name = document.createElement("strong"); name.textContent = row.path.slice(ctx.id.length + 1);
          const state = document.createElement("p"); state.className = "photo-inventory-state";
          state.dataset.review = String(!row.uses.length || !row.tracked); state.textContent = uses.join(" / ");
          const detail = document.createElement("p");
          const date = new Date(row.created_at);
          const size = Number.isSafeInteger(row.size_bytes) && row.size_bytes >= 0 ? `${(row.size_bytes / 1024).toLocaleString("ja-JP", {maximumFractionDigits:1})} KB` : "容量不明";
          detail.textContent = `${privatePhoto ? "非公開の元写真" : "公開用コピー"} / ${size} / ${row.created_at && !Number.isNaN(date.getTime()) ? date.toLocaleString("ja-JP") : "日時不明"}`;
          if (!privatePhoto && row.cleanup_after && row.failed_copy && row.can_cleanup !== true && !row.uses.length) {
            const after = new Date(row.cleanup_after);
            if (!Number.isNaN(after.getTime())) detail.textContent += ` / 整理の再確認: ${after.toLocaleString("ja-JP")}以降`;
          }
          li.append(name, state, detail);
          if (privatePhoto && row.can_delete === true || !privatePhoto && row.can_cleanup === true) {
            const button = document.createElement("button"); button.type = "button";
            button.textContent = privatePhoto ? (row.deletion_status === "pending" ? "削除処理を再確認" : "削除前に確認") : (row.cleanup_status === "pending" ? "コピー整理を再確認" : "整理前に確認");
            button.disabled = busy || !userId;
            button.addEventListener("click", () => task(nextCtx => reviewDeletion(nextCtx, row)));
            li.append(button);
          }
          return li;
        });
        $("photo-inventory-list").append(...rows);
        inventoryOffset = start + value.items.length; inventoryMore = value.has_more;
        message.textContent = `${new Date().toLocaleTimeString("ja-JP")}取得 / 写真${inventoryOffset}件${inventoryMore ? "（続きあり）" : ""} / 削除処理待ち${pending.length}件。取得時点のオンライン情報です。`;
      } catch (error) {
        if (!current(ctx)) return;
        message.textContent = error.message || "使用状況を取得できませんでした。";
        message.dataset.error = "true";
      }
    }
    $("photo-inventory-refresh").addEventListener("click", () => task(ctx => inventory(ctx, false)));
    $("photo-inventory-more").addEventListener("click", () => task(ctx => inventory(ctx, true)));
    async function reviewDeletion(ctx, row) {
      closeDeletion();
      await authorize(ctx);
      const path = objectPath(ctx.id, row.path.slice(ctx.id.length + 1));
      const isCleanup = row.bucket === "gyoda-published-photos";
      if ((!isCleanup && row.bucket !== bucket) || path !== row.path) throw new Error("削除対象が不正です。");
      const retry = (isCleanup ? row.cleanup_status : row.deletion_status) === "pending";
      let blob;
      if (!isCleanup && !retry) {
        const result = await storage().download(path);
        if (!current(ctx)) return;
        if (result.error || !(result.data instanceof Blob) || !types.includes(result.data.type) || result.data.size > 5242880) throw new Error("削除対象の写真を表示できませんでした。削除はしていません。");
        blob = result.data;
      }
      if (!current(ctx)) return;
      deletionReview = {ctx,path,isCleanup};
      $("photo-delete-title").textContent = isCleanup ? "公開失敗のコピーを整理" : "非公開写真の削除";
      $("photo-delete-note").textContent = isCleanup ? "公開に失敗したコピーだけを削除します。非公開の元写真は残ります。削除を開始したコピーはカードに指定できなくなります。この操作は元に戻せません。" : "この写真は元に戻せません。削除を開始した写真は公開候補に指定できなくなります。";
      $("photo-delete-target").textContent = `${ctx.name} / ${path}`;
      $("photo-delete-ack").checked = false;
      $("photo-delete-status").textContent = retry ? "削除受付済みです。ファイルが残っていれば削除し、完了済みなら履歴を確定します。" : isCleanup ? "失敗から24時間以上経過した、未使用のコピーが対象です。実行時にも使用状況を再確認します。" : "まだ削除していません。";
      $("photo-delete-status").dataset.error = "false";
      $("photo-delete-confirm").textContent = retry ? "削除処理を再試行する" : isCleanup ? "このコピーを整理する" : "この写真を削除する";
      if (blob) { deletionUrl = URL.createObjectURL(blob); $("photo-delete-image").src = deletionUrl; $("photo-delete-image").hidden = false; }
      deletionDialog.showModal();
    }
    $("photo-delete-ack").addEventListener("change", render);
    $("photo-delete-cancel").addEventListener("click", closeDeletion);
    deletionDialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    deletionDialog.addEventListener("close", () => { if (!deletionDialog.open) closeDeletion(); });
    $("photo-delete-image").addEventListener("error", () => { closeDeletion(); status("写真を表示できないため削除確認を中止しました。", true); });
    $("photo-delete-confirm").addEventListener("click", () => {
      const pending = deletionReview;
      if (!pending || !$("photo-delete-ack").checked) return;
      task(async () => {
        const message = $("photo-delete-status");
        try {
          await authorize(pending.ctx);
          message.dataset.error = "false"; message.textContent = "使用状況を再確認して削除中…";
          const result = await getClient().functions.invoke(pending.isCleanup ? "cleanup-failed-photo" : "delete-private-photo", {body:{object_path:pending.path,confirm_delete:true}});
          if (!current(pending.ctx)) return;
          if (result.error) {
            if ([400,409].includes(result.error.context?.status)) throw new Error("使用中などの理由で削除できませんでした。閉じて使用状況を再取得してください。");
            throw new Error("削除結果を確認できませんでした。関数の登録・ログイン・通信状態を確認し、同じ写真で再試行してください。");
          }
          if (result.data?.status !== "completed" || result.data.object_path !== pending.path) throw new Error("削除結果が不明です。同じ写真で再試行してください。");
          closeDeletion();
          if (!pending.isCleanup && viewedPath === pending.path) clearImage();
          try { if (!pending.isCleanup) await list(pending.ctx, false); }
          catch { if (current(pending.ctx)) status("写真の削除は完了しましたが、保存済み一覧を取得できませんでした。再取得してください。", true); return; }
          if (!current(pending.ctx)) return;
          await inventory(pending.ctx, false);
          if (current(pending.ctx)) status(pending.isCleanup ? "公開失敗のコピーを整理しました。非公開の元写真と公開カードは変更していません。" : "非公開写真を削除しました。公開カードは変更していません。");
        } catch (error) {
          if (current(pending.ctx)) { message.textContent = error.message; message.dataset.error = "true"; }
        }
      });
    });
    async function list(ctx, append) {
      await authorize(ctx);
      status("非公開写真の一覧を取得中…");
      const start = append ? offset : 0;
      const result = await storage().list(ctx.id, { limit: 50, offset: start, sortBy: { column: "created_at", order: "desc" } });
      if (!current(ctx)) return;
      if (result.error) throw new Error("一覧を取得できませんでした。ログイン・通信状態とStorageの設定を確認してください。");
      if (!Array.isArray(result.data)) throw new Error("写真一覧の形式が不正です。");
      if (!append) $("private-photo-list").replaceChildren(new Option("写真を選択", ""));
      for (const row of result.data) {
        if (!namePattern.test(row.name)) continue;
        if ([...$("private-photo-list").options].some(option => option.value === row.name)) continue;
        const date = new Date(row.created_at);
        const label = Number.isNaN(date.getTime()) ? row.name : `${date.toLocaleString("ja-JP")} / ${row.name.slice(0, 8)}`;
        $("private-photo-list").add(new Option(label, row.name));
      }
      offset = start + result.data.length; more = result.data.length === 50;
      status($("private-photo-list").options.length > 1 ? "保存済みの非公開写真を取得しました。" : "このスポットの非公開写真はまだありません。");
    }
    $("private-photo-file").addEventListener("change", () => {
      const file = $("private-photo-file").files[0];
      if (!file) return;
      task(async ctx => {
        prepared = null; uploadPath = null; clearImage();
        $("private-photo-list").value = "";
        status("送信前の画像を準備中…");
        const result = await prepare(file);
        if (!current(ctx)) return;
        prepared = result;
        show(result.blob, `${ctx.name}の送信前の写真`);
        status(`未送信 / ${result.width} × ${result.height}px / ${Math.ceil(result.blob.size / 1024)}KB`);
      });
    });
    $("private-photo-upload").addEventListener("click", () => task(async ctx => {
      if (!prepared) throw new Error("先に写真を選んでください。");
      const pending = prepared;
      await authorize(ctx);
      // Reuse the same key after an ambiguous response, never duplicate blindly.
      uploadPath ??= objectPath(ctx.id, `${crypto.randomUUID()}.${pending.extension}`);
      const path = uploadPath;
      status(`${ctx.name} の写真を非公開で保存中…`);
      const result = await storage().upload(path, pending.blob, { contentType: pending.blob.type, upsert: false, cacheControl: "0" });
      if (!current(ctx)) return;
      if (result.error) throw new Error("保存の完了を確認できませんでした。「保存済み写真を取得」で確認してください。再試行は同じ保存先を使い、上書きしません。");
      prepared = null; uploadPath = null; $("private-photo-file").value = "";
      await list(ctx, false);
      if (!current(ctx)) return;
      $("private-photo-list").value = path.slice(ctx.id.length + 1);
      viewedPath = path;
      status(`${ctx.name} の写真を非公開で保存しました。公開カードの写真は変更していません。`);
    }));
    $("private-photo-refresh").addEventListener("click", () => task(ctx => list(ctx, false)));
    $("private-photo-more").addEventListener("click", () => task(ctx => list(ctx, true)));
    $("private-photo-list").addEventListener("change", () => {
      const filename = $("private-photo-list").value;
      if (!filename) { clearImage(); render(); return; }
      task(async ctx => {
        clearImage(); prepared = null; uploadPath = null; $("private-photo-file").value = "";
        await authorize(ctx);
        status("非公開写真を取得中…");
        const result = await storage().download(objectPath(ctx.id, filename));
        if (!current(ctx)) return;
        if (result.error || !(result.data instanceof Blob)) throw new Error("写真を取得できませんでした。権限・通信状態を確認してください。");
        if (!types.includes(result.data.type) || result.data.size > 5 * 1024 * 1024) throw new Error("写真の形式またはサイズが不正です。");
        show(result.data, `${ctx.name}の保存済み非公開写真`);
        viewedPath = objectPath(ctx.id, filename);
        status("保存済みの非公開写真です。まだ公開していません。");
      });
    });
    async function choose(ctx, path) {
      await authorize(ctx);
      const client = getClient();
      const draft = await client.from("spot_content_drafts").select("spot_id").eq("spot_id", ctx.id).maybeSingle();
      if (draft.error) throw new Error("下書きを確認できませんでした。");
      if (!draft.data) throw new Error("先にカード情報をオンライン保存してください。");
      const before = await client.from("spot_photo_drafts").select("spot_id,object_name,revision").eq("spot_id", ctx.id).maybeSingle();
      if (before.error) throw new Error("写真の指定を確認できませんでした。");
      await authorize(ctx);
      const table = client.from("spot_photo_drafts");
      const query = before.data
        ? table.update({ object_name:path }).eq("spot_id",ctx.id).eq("revision",before.data.revision)
        : table.insert({ spot_id:ctx.id, object_name:path });
      const result = await query.select("spot_id,object_name,revision").maybeSingle();
      if (!current(ctx)) return;
      if (result.error || !result.data || result.data.object_name !== path) throw new Error("写真の指定を保存できませんでした。他の画面での変更や通信状態を確認して再操作してください。");
      status(path ? "公開候補を保存しました。「公開内容を確認」で写真を確認してから公開してください。まだ非公開です。" : "オンライン下書きの写真URLを使う指定に戻しました。公開内容はまだ変更していません。");
    }
    $("private-photo-choose").addEventListener("click", () => {
      const path = viewedPath;
      if (path) task(ctx => choose(ctx, path));
    });
    $("private-photo-use-url").addEventListener("click", () => task(ctx => choose(ctx, null)));
    $("private-photo-clear").addEventListener("click", () => {
      prepared = null; uploadPath = null; $("private-photo-file").value = "";
      $("private-photo-list").value = ""; clearImage();
      status("プレビューを閉じました。保存済みの写真は削除していません。"); render();
    });
    $("spot-select").addEventListener("change", () => { reset(); render(); });
    root.addEventListener("pagehide", () => { reset(); render(); });
    image.addEventListener("error", () => { clearImage(); status("写真を表示できませんでした。別の写真を選んでください。", true); render(); });
    reset(); render();
    return { setAccess };
  }
  const api = { validateFile, dimensions, objectPath, prepare, mount };
  root.GyodaPrivatePhotos = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
