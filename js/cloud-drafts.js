(function () {
  "use strict";
  const adminId = "affc8719-3bac-49ce-b251-24106f2929f4";
  const url = GyodaPublicationData.url;
  // Public client key. Authorization is enforced by database grants and RLS.
  const key = GyodaPublicationData.key;
  const sdkUrl = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js";
  let sdkPromise;
  const mediaFields = ["photo", "youtube2", "youtube", "homepage"];
  const columns = "spot_id,name,description," + mediaFields.join(",");
  function loadSDK() {
    if (window.supabase) return Promise.resolve(window.supabase);
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(fail, 15000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        sdkPromise = null;
        reject(new Error("接続用ライブラリを取得できません。通信環境を確認して再試行してください。"));
      }
      script.src = sdkUrl;
      script.onload = () => {
        clearTimeout(timer);
        if (window.supabase) resolve(window.supabase);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
    return sdkPromise;
  }
  function validate(draft) {
    if (!draft || !/^spot-[0-9]{3,}$/.test(draft.spot_id) ||
        typeof draft.name !== "string" || !draft.name.trim() || draft.name.length > 100 ||
        typeof draft.description !== "string" || draft.description.length > 3000) {
      throw new Error("名前（1〜100文字）と説明文（3000文字以内）を確認してください。");
    }
    for (const field of mediaFields) {
      // Legacy drafts have NULL media fields; they must not clear local values.
      if (draft[field] == null) continue;
      const error = GyodaSpotData.fieldError(field, draft[field]);
      if (error) throw new Error(error);
    }
    return draft;
  }
  function mount({ getSpot, getBaseline, applyDraft }) {
    const $ = id => document.getElementById(id);
    let client, user = null, busy = false, generation = 0;
    let publication, privatePhotos;
    function status(text, failure = false) {
      $("cloud-status").textContent = text;
      $("cloud-status").dataset.error = String(failure);
    }
    function render() {
      $("cloud-login").hidden = Boolean(user);
      $("cloud-account").hidden = !user;
      $("cloud-user").textContent = user?.email || "";
      for (const id of ["cloud-signin", "cloud-load", "cloud-save", "cloud-signout"]) $(id).disabled = busy;
      publication?.setAccess(user, busy);
      privatePhotos?.setAccess(user, busy);
    }
    async function run(action) {
      if (busy) return;
      busy = true;
      render();
      try { await action(); }
      catch (reason) { status(`操作できませんでした。${reason.message || "通信・ログイン状態・アクセス権限を確認してください。"}`, true); }
      finally { busy = false; render(); }
    }
    async function requireAdmin() {
      const result = await client.auth.getUser();
      if (result.error || result.data.user?.id !== adminId) {
        user = null;
        generation++;
        throw new Error("管理者として再ログインしてください。");
      }
      return result.data.user;
    }
    $("cloud-login").addEventListener("submit", event => {
      event.preventDefault();
      const email = $("cloud-email").value.trim();
      const password = $("cloud-password").value;
      run(async () => {
        status("ログイン中…");
        try {
          if (!client) {
            const sdk = await loadSDK();
            client = sdk.createClient(url, key, {
              auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true }
            });
            client.auth.onAuthStateChange((event, session) => {
              if (!session && user) {
                user = null;
                generation++;
                render();
                status("ログアウトしました。編集内容はそのまま残っています。");
              }
            });
          }
          const result = await client.auth.signInWithPassword({ email, password });
          if (result.error) throw new Error("メールアドレス・パスワードと通信状態を確認してください。");
          if (result.data.user?.id !== adminId) {
            await client.auth.signOut({ scope: "local" });
            throw new Error("このアカウントには管理者権限がありません。");
          }
          user = await requireAdmin();
          generation++;
          status("ログインしました。オンライン下書きはまだ読み込んでいません。");
        } finally { $("cloud-password").value = ""; }
      });
    });
    $("cloud-signout").addEventListener("click", () => run(async () => {
      const result = await client.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      user = null;
      generation++;
      status("ログアウトしました。編集内容はそのまま残っています。");
    }));
    $("cloud-save").addEventListener("click", () => run(async () => {
      const spot = getSpot();
      const draft = validate({
        spot_id: spot.id, name: spot.name, description: spot.desc || "",
        ...Object.fromEntries(mediaFields.map(field => [field, spot[field] ?? ""]))
      });
      const requestGeneration = generation;
      const admin = await requireAdmin();
      if (generation !== requestGeneration) throw new Error("ログイン状態が変わりました。再試行してください。");
      status(`${spot.name} の下書きを保存中…`);
      const result = await client.from("spot_content_drafts")
        .upsert({ ...draft, owner_id: admin.id }, { onConflict: "spot_id" })
        .select(columns).single();
      if (result.error) throw result.error;
      validate(result.data);
      status(`${draft.name} のカード情報6項目を保存しました（ボタンを押した時点）。端末内下書き・公開サイトは変更していません。`);
    }));
    $("cloud-load").addEventListener("click", () => run(async () => {
      const spot = getSpot();
      const requestGeneration = generation;
      await requireAdmin();
      status(`${spot.name} の下書きを取得中…`);
      const result = await client.from("spot_content_drafts").select(columns)
        .eq("spot_id", spot.id).maybeSingle();
      if (result.error) throw result.error;
      if (requestGeneration !== generation || getSpot().id !== spot.id) {
        status("選択スポットまたはログイン状態が変わったため、読み込みを中止しました。");
        return;
      }
      if (!result.data) { status("このスポットのオンライン下書きはまだありません。"); return; }
      const draft = validate(result.data);
      if (draft.spot_id !== spot.id) throw new Error("取得したスポットIDが一致しません。");
      const legacy = mediaFields.some(field => draft[field] == null);
      if (!window.confirm(`${spot.name} のカード情報をオンライン下書きに置き換えますか？保存済み項目の現在の入力は上書きされます。${legacy ? "オンラインに未保存の写真・URLは現在の入力を残します。" : ""}`)) {
        status("読み込みをキャンセルしました。");
        return;
      }
      if (applyDraft(draft)) status(`カード情報を読み込みました。${legacy ? "オンラインに未保存の写真・URLは現在の入力を保持しました。" : ""}端末内下書きと公開サイトは未更新です。`);
    }));
    publication = GyodaPublication.mount({ getSpot, getBaseline, getClient: () => client, requireAdmin, run, status });
    privatePhotos = GyodaPrivatePhotos.mount({ getSpot, getClient: () => client, requireAdmin, run });
    render();
  }
  window.GyodaCloudDrafts = { mount };
})();
