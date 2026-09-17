let currentLocation = null;

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentLocation = [pos.coords.latitude, pos.coords.longitude];
        resolve(currentLocation);
      },
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}
const panelEl = document.getElementById("spot-panel");
const panelBodyEl = document.getElementById("spot-panel-body");
const panelCloseEl = document.getElementById("spot-panel-close");
let activeSpot = null;

function openSpotPanel(spot){
  if (!panelEl || !panelBodyEl) return;
  activeSpot = spot;
  closeMobileMapPanels();
  panelBodyEl.innerHTML = buildPopupHtml(spot); // ← 今のカードHTMLをそのまま再利用
  panelEl.classList.remove("is-hidden");
  document.body.classList.add("spot-panel-open");
}

function closeSpotPanel(){
  if (!panelEl) return;
  panelEl.classList.add("is-hidden");
  document.body.classList.remove("spot-panel-open");
  if (panelBodyEl) panelBodyEl.innerHTML = "";
}

const feedbackDialogEl = document.getElementById("feedback-dialog");
const feedbackFormEl = document.getElementById("feedback-form");
const feedbackSuccessEl = document.getElementById("feedback-success");
const feedbackSpotEl = document.getElementById("feedback-spot");
const feedbackMessageEl = document.getElementById("feedback-message");
const feedbackCountEl = document.getElementById("feedback-count");
let feedbackReturnFocusEl = null;

function openFeedbackForm(spotName = "") {
  if (!feedbackDialogEl || !feedbackFormEl || !feedbackSpotEl) return;
  feedbackReturnFocusEl = document.activeElement;
  feedbackFormEl.reset();
  feedbackFormEl.hidden = false;
  if (feedbackSuccessEl) feedbackSuccessEl.hidden = true;
  feedbackSpotEl.value = spotName;
  if (feedbackCountEl) feedbackCountEl.value = 0;
  feedbackDialogEl.classList.remove("is-hidden");
  document.body.classList.add("feedback-dialog-open");
  window.setTimeout(() => (spotName ? feedbackMessageEl : feedbackSpotEl)?.focus(), 0);
}

function closeFeedbackForm() {
  if (!feedbackDialogEl) return;
  feedbackDialogEl.classList.add("is-hidden");
  document.body.classList.remove("feedback-dialog-open");
  feedbackReturnFocusEl?.focus?.();
}

function saveDemoFeedback(entry) {
  const storageKey = "gyoda-tourist-map-feedback-demo";
  let savedEntries = [];
  try {
    savedEntries = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(savedEntries)) savedEntries = [];
  } catch {
    savedEntries = [];
  }
  savedEntries.push(entry);
  localStorage.setItem(storageKey, JSON.stringify(savedEntries));
}

document.getElementById("feedback-open")?.addEventListener("click", () => openFeedbackForm());
document.getElementById("feedback-close")?.addEventListener("click", closeFeedbackForm);
document.getElementById("feedback-done")?.addEventListener("click", closeFeedbackForm);
feedbackDialogEl?.querySelectorAll("[data-feedback-close]").forEach((button) => {
  button.addEventListener("click", closeFeedbackForm);
});

panelBodyEl?.addEventListener("click", (event) => {
  const button = event.target.closest(".spot-feedback-btn");
  if (!button || !activeSpot) return;
  openFeedbackForm(activeSpot.name);
});

feedbackMessageEl?.addEventListener("input", () => {
  if (feedbackCountEl) feedbackCountEl.value = feedbackMessageEl.value.length;
});

feedbackFormEl?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!feedbackFormEl.reportValidity()) return;

  const formData = new FormData(feedbackFormEl);
  saveDemoFeedback({
    submittedAt: new Date().toISOString(),
    spot: formData.get("spot"),
    visitMonth: formData.get("visitMonth"),
    category: formData.get("category"),
    message: formData.get("message"),
    nickname: formData.get("nickname") || "匿名"
  });

  feedbackFormEl.hidden = true;
  if (feedbackSuccessEl) {
    feedbackSuccessEl.hidden = false;
    feedbackSuccessEl.querySelector("button")?.focus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !feedbackDialogEl?.classList.contains("is-hidden")) {
    closeFeedbackForm();
  }
});

if (panelCloseEl){
  panelCloseEl.addEventListener("click", closeSpotPanel);
}

const mobilePanelMedia = window.matchMedia("(max-width: 760px)");

function updateMobilePanelButton(button, isOpen) {
  if (!button) return;
  button.classList.toggle("is-active", isOpen);
  button.setAttribute("aria-expanded", String(isOpen));
}

function setMobileMapPanel(panelName, shouldOpen) {
  if (!mobilePanelMedia.matches) return;

  const legend = document.getElementById("legend");
  const routePanel = document.getElementById("route-panel");
  const legendButton = document.getElementById("mobile-legend-toggle");
  const routeButton = document.getElementById("mobile-route-toggle");
  const targetPanel = panelName === "legend" ? legend : routePanel;
  const otherPanel = panelName === "legend" ? routePanel : legend;
  const targetButton = panelName === "legend" ? legendButton : routeButton;
  const otherButton = panelName === "legend" ? routeButton : legendButton;

  targetPanel?.classList.toggle("is-mobile-open", shouldOpen);
  targetPanel?.setAttribute("aria-hidden", String(!shouldOpen));
  otherPanel?.classList.remove("is-mobile-open");
  otherPanel?.setAttribute("aria-hidden", "true");
  updateMobilePanelButton(targetButton, shouldOpen);
  updateMobilePanelButton(otherButton, false);
}

function closeMobileMapPanels() {
  if (!mobilePanelMedia.matches) return;

  document.getElementById("legend")?.classList.remove("is-mobile-open");
  document.getElementById("route-panel")?.classList.remove("is-mobile-open");
  document.getElementById("legend")?.setAttribute("aria-hidden", "true");
  document.getElementById("route-panel")?.setAttribute("aria-hidden", "true");
  updateMobilePanelButton(document.getElementById("mobile-legend-toggle"), false);
  updateMobilePanelButton(document.getElementById("mobile-route-toggle"), false);
}

function syncMobilePanelLayout() {
  const legend = document.getElementById("legend");
  const routePanel = document.getElementById("route-panel");

  if (mobilePanelMedia.matches) {
    closeMobileMapPanels();
    return;
  }

  legend?.classList.remove("is-mobile-open");
  routePanel?.classList.remove("is-mobile-open");
  legend?.removeAttribute("aria-hidden");
  routePanel?.removeAttribute("aria-hidden");
  updateMobilePanelButton(document.getElementById("mobile-legend-toggle"), false);
  updateMobilePanelButton(document.getElementById("mobile-route-toggle"), false);
}

document.getElementById("mobile-legend-toggle")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const panel = document.getElementById("legend");
  setMobileMapPanel("legend", !panel?.classList.contains("is-mobile-open"));
});

document.getElementById("mobile-route-toggle")?.addEventListener("click", (event) => {
  event.stopPropagation();
  const panel = document.getElementById("route-panel");
  setMobileMapPanel("route", !panel?.classList.contains("is-mobile-open"));
});

if (typeof mobilePanelMedia.addEventListener === "function") {
  mobilePanelMedia.addEventListener("change", syncMobilePanelLayout);
} else {
  mobilePanelMedia.addListener(syncMobilePanelLayout);
}

syncMobilePanelLayout();

function initPetalLayer() {
  const layer = document.getElementById("petal-layer");
  if (!layer) return;

  const petalCount = window.matchMedia("(max-width: 760px)").matches ? 14 : 22;
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < petalCount; i += 1) {
    const petal = document.createElement("span");
    const size = 8 + Math.random() * 10;
    const duration = 18 + Math.random() * 18;
    const delay = Math.random() * -duration;
    const x = Math.random() * 100;
    const drift = (Math.random() * 34 - 17).toFixed(1);
    const sway = (8 + Math.random() * 24).toFixed(1);
    const rotate = (Math.random() * 360).toFixed(1);
    const opacity = (0.22 + Math.random() * 0.28).toFixed(2);
    const staticY = (Math.random() * 96).toFixed(1);

    petal.className = "lotus-petal";
    petal.style.setProperty("--petal-size", `${size.toFixed(1)}px`);
    petal.style.setProperty("--petal-duration", `${duration.toFixed(1)}s`);
    petal.style.setProperty("--petal-delay", `${delay.toFixed(1)}s`);
    petal.style.setProperty("--petal-x", `${x.toFixed(1)}vw`);
    petal.style.setProperty("--petal-drift", `${drift}vw`);
    petal.style.setProperty("--petal-sway", `${sway}px`);
    petal.style.setProperty("--petal-rotate", `${rotate}deg`);
    petal.style.setProperty("--petal-opacity", opacity);
    petal.style.setProperty("--petal-static-y", `${staticY}vh`);
    fragment.appendChild(petal);
  }

  layer.replaceChildren(fragment);
}

initPetalLayer();

async function openGoogleMapsRoute(destLat, destLon) {
  const destination = `${destLat},${destLon}`;
  const destinationOnlyUrl =
    `https://www.google.com/maps/dir/?api=1` +
    `&destination=${destination}` +
    `&travelmode=walking`;

  try {
    const location = currentLocation ?? await getCurrentLocation();
    const origin = location.join(",");
    const url =
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${origin}` +
      `&destination=${destination}` +
      `&travelmode=walking`;

    window.open(url, "_blank");
  } catch {
    const shouldOpenDestination = window.confirm(
      "現在地を取得できませんでした。目的地だけGoogle Mapsで開きますか？"
    );
    if (shouldOpenDestination) {
      window.open(destinationOnlyUrl, "_blank");
    }
  }
}

function toYouTubeEmbedUrl(url) {
  if (!url) return "";

  try {
    const u = new URL(url);

    // youtu.be/<id>
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }

    // www.youtube.com / m.youtube.com / youtube.com
    if (u.hostname.includes("youtube.com")) {
      // /watch?v=<id>
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }

      // /shorts/<id>
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/shorts/")[1]?.split("/")[0];
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }

      // /embed/<id>（すでに埋め込み）
      if (u.pathname.startsWith("/embed/")) {
        return u.toString();
      }
    }

    return "";
  } catch {
    return "";
  }
}





function buildPopupHtml(spot) {
  const title = `<div class="popup-title">${spot.name}</div>`;

  const desc = spot.desc ? `<div class="popup-desc">${spot.desc}</div>` : "";

  const photo = spot.photo
    ? `<img src="${spot.photo}" class="popup-img" alt="${spot.name}" loading="lazy" />`
    : "";

  // ✅ Shorts：地図上で再生
  const shortEmbed = toYouTubeEmbedUrl(spot.youtube2);
 const shortVideo = shortEmbed
  ? `
    <div class="popup-video popup-video-vertical">
      <iframe
        src="${shortEmbed}"
        title="YouTube Shorts"
        frameborder="0"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    </div>
  `
  : "";


  // ✅ Vlog（長尺）：YouTubeに遷移
  const vlogLink = spot.youtube
    ? `
      <a class="popup-vlog-link"
         href="${spot.youtube}"
         target="_blank"
         rel="noopener noreferrer">
        ▶︎ YouTubeで詳しくみる
      </a>
    `
    : "";

  // 公式サイトなど（youtube2は埋め込みにするのでリンクには入れない）
  const links = [
    spot.homepage
      ? `<a href="${spot.homepage}" target="_blank" rel="noopener noreferrer">詳しい情報はこちら</a>`
      : ""
  ].filter(Boolean);

  const linksHtml = links.length ? `<div class="popup-links">${links.join("<br>")}</div>` : "";

  // Google Maps案内ボタン（全スポット共通でOK）
  const googleRouteBtn = `
    <button class="google-route-btn" onclick="openGoogleMapsRoute(${spot.lat}, ${spot.lon})">
      Google Mapで道案内
    </button>
  `;

  const feedbackBtn = `
    <button class="spot-feedback-btn" type="button">
      このスポットの声を送る
    </button>
  `;

  return `
    <div style="max-width:300px">
      ${title}
      ${desc}
      ${shortVideo}
      ${photo}
      ${linksHtml}
      ${vlogLink}
      ${googleRouteBtn}
      ${feedbackBtn}
    </div>
  `;
}


    // ◆ 観光スポット配列
    const CATEGORY = {
  sightseeing: { label: "観光施設", color: "#f3a8c8" }, // 淡いピンク
  food:       { label: "飲食店",   color: "#fff462" }, // 黄
  station:    { label: "駅",       color: "#2563eb" },  // 青（必要なら）
  onsen:   {label:"温泉",  color:"#c2894b"},
  souvenir:{label:"お土産", color:"#54917f"}
};
    const spots = [
      {
        name: "古代蓮の里",
        lat: 36.132689,
        lon: 139.500927,
        category: "sightseeing",
        color: "#22c55e",
        photo: "https://github.com/user-attachments/assets/203a0e5d-ae84-4553-93fe-fe442edb7c90",
        youtube: "https://youtu.be/F4jcAJ014tU?si=7B2PC2OLNnX6_edu",
        youtube2:"https://youtube.com/shorts/XfUT41sUD_4?feature=share",
        homepage: "https://www.gyoda-kankoukyoukai.jp/lotus.html"
      },
      {
        name: "さきたま古墳公園",
        lat: 36.12800159,
        lon: 139.4799882,
        category: "sightseeing",
        color: "#22c55e",
        photo: "https://github.com/user-attachments/assets/22a094e1-de08-4899-9c70-b3c8c10418d5",
        youtube2:"https://youtube.com/shorts/Ys61rD0B9cM?si=Q80cr9QZ9f2FQkaD",
        homepage: "https://www.gyoda-kankoukyoukai.jp/spot/671"
      },
      {
        name: "行田市郷土博物館・忍城",
        lat: 36.13791006,
        lon: 139.453343,
        category: "sightseeing",
        color: "#22c55e",
        photo: "https://github.com/user-attachments/assets/20e5b0c6-9aa5-44d4-abd8-cbdc5765d3ee",
        youtube2:"https://youtube.com/shorts/skSTB2O5SkI?feature=share",
        homepage: "https://www.gyoda-kankoukyoukai.jp/spot/973",
        desc:"行田市の歴史を学ぶことができる博物館。そのまま忍城の中も見学できます！"
      },
      {
        name: "JR行田駅",
      　lat:36.11381256998107,
        lon: 139.43219535581972,
        category: "station",
        color: "#2563eb",
        desc:"JR高崎線の駅。大宮まで約40分、上野・東京・新宿・渋谷などの都内主要駅から乗り換えなしでアクセス可能！"
      },
      {
        name: "行田市駅",
        lat: 36.143572,
        lon: 139.459108,
        category: "station",
        color: "#2563eb",
        homepage: "https://www.chichibu-railway.co.jp/station/06_gyoda.html",
        desc: "秩父鉄道の駅。忍城や市街地散策の最寄り駅として利用できます。"
      },
      {
        name: "水城公園",
        lat: 36.13483418826252,
        lon: 139.45874369551495,
        photo:"https://github.com/user-attachments/assets/07db42d8-4bb5-4adf-87a9-c297da421e31",
        category: "sightseeing",
        color: "#22c55e",
        desc:"忍城の名残の堀や沼を基に整備した公園。四季の変化が魅力で、憩いの場となっています。お散歩にオススメ！"

      },
         {
        name: "行田八幡神社",
        lat: 36.13906,
        lon:  139.46147,
        category: "sightseeing",
        photo:"https://github.com/user-attachments/assets/3db6cd27-b29f-468d-a181-a3f6afd092eb",
        color: "#22c55e",
        homepage:"https://www.gyoda-kankoukyoukai.jp/spot/1004",
        desc:"「封じの宮」と称され、虫封じや難病封じお年寄りの、ぼけ封じなどの封じ祈願が継承されています。花手水を鑑賞できるかも‼"
      },
       {
        name: "足袋とくらしの博物館",
        lat: 36.14087,
        lon:  139.45810,
        category: "sightseeing",
        photo:"https://github.com/user-attachments/assets/ae9c1ee6-0556-4d4f-aded-4680fdd0ac46",
        color: "#22c55e",
        homepage:"https://www.gyoda-kankoukyoukai.jp/spot/733",
     　　desc:"元々は牧野本店という足袋工場。展示物や足袋づくりの実演を見学可能‼My足袋づくり体験も‼（要予約）",
      },

       {
        name: "行田・湯本天然温泉 茂美の湯",
        lat: 36.12744,
        lon:  139.47235,
        category: "onsen",
        photo:"https://github.com/user-attachments/assets/803455aa-7948-42c6-a536-0923c4631ad4",
        color: "#FFEC50",
        homepage:"https://mominoyu.com/",

      },
      {
        name: "前玉(さきたま)神社",
        lat: 36.12336088024693,
        lon:  139.47963882213634,
        category: "sightseeing",
        color: "#22c55e",
        photo:"https://github.com/user-attachments/assets/5121549f-5275-4281-8a67-70ecdb09758e",
        youtube2:"https://youtube.com/shorts/aWfyMtGJwGM?si=SQ0PCV78lAXAI4vR",

      },
       {
        name: "かねつき堂",
        lat: 36.13895781856619,
        lon:  139.45167731963446,
        category: "food",
        desc:"行田名物のゼリーフライとフライが有名なお店‼ 月曜定休、火～日11:00-17:00",
        photo:"https://github.com/user-attachments/assets/9047c74b-6564-4074-949a-3ba6e429cac3",
        color: "#ef4444",

      },
       {
        name: "金澤製菓",
        lat: 36.12414197823914,
        lon:  139.48043697306653,
        photo:"https://github.com/user-attachments/assets/0c6379ff-072f-42db-a421-1d4692592ce7",
        category: "souvenir",
        color: "#F79428",

      },
      {
        name: "十万石ふくさや 行田本店",
        lat: 36.141301805501094,
        lon:  139.46101358575336,
        category: "souvenir",
        color: "#F79428",

      },
      {
        name: "行田天然温泉 古代蓮物語",
        lat: 36.13592755579241,
        lon:  139.46549395962916,
        category: "onsen",
        color: "#FFEC50",

      },
      {
        name: "城西ラーメン",
        lat: 36.13602502473986,
        lon:   139.4463881848658,
        category: "food",
        color: "#ef4444",

      },
       {
        name: "フライ・焼きそばの店 山下",
        lat: 36.11590685683875,
        lon: 139.46001279507158,
        category: "food",
        color: "#ef4444",

      },
      {
        name: "イサミ足袋本舗",
        lat: 36.13735347548533,
        lon: 139.46291681665127,
        category: "souvenir",
        photo:"https://github.com/user-attachments/assets/e3dacf0d-de16-44ec-9ab0-55d1fe112bbf",
        color: "#F79428",
      },
        {
        name: "ヴェールカフェ",
        lat: 36.13444420976873,
        lon: 139.45973182688454,
        photo:"https://github.com/user-attachments/assets/0ed87dce-55af-4f68-8504-a827ab37c1e7",
        category: "food",
        color: "#ef4444",
      },
    ];

    const FEATURED_ROUTE = {
      id: "major-sights",
      name: "主要観光地巡り",
      color: "#b65478",
      spotNames: [
        "行田市駅",
        "行田市郷土博物館・忍城",
        "さきたま古墳公園",
        "古代蓮の里"
      ]
    };

    const FEATURED_ROUTE_STORY = [
      {
        name: "行田市駅",
        description: "行田のまち歩きはここから。駅を出て、城下町の歴史をたどる旅を始めます。",
        zoom: 15.3,
        pitch: 56,
        bearing: -24
      },
      {
        name: "行田市郷土博物館・忍城",
        description: "城下町の中心に建つ忍城。水に囲まれた地形と、現在の市街地との関係を眺めます。",
        zoom: 15.5,
        pitch: 58,
        bearing: 22
      },
      {
        name: "さきたま古墳公園",
        description: "市街地から古墳群へ。大きな墳丘が集まる、行田を代表する古代の景観です。",
        zoom: 14.8,
        pitch: 57,
        bearing: -28
      },
      {
        name: "古代蓮の里",
        description: "旅の終点は古代蓮の里。水辺と田園の中に広がる、行田らしい季節の風景です。",
        zoom: 15.1,
        pitch: 55,
        bearing: 26
      }
    ];

    const featuredRouteSpots = FEATURED_ROUTE.spotNames
      .map((name) => spots.find((spot) => spot.name === name))
      .filter(Boolean);
    const featuredRouteCoordinates = featuredRouteSpots.map((spot) => [spot.lon, spot.lat]);
    const featuredRouteStorySteps = FEATURED_ROUTE_STORY
      .map((step) => {
        const spot = featuredRouteSpots.find((candidate) => candidate.name === step.name);
        return spot ? { ...step, spot } : null;
      })
      .filter(Boolean);
    const routeStopMarkers = [];
    let isFeaturedRouteVisible = true;
    let isRouteStoryActive = false;
    let routeStoryStepIndex = -1;

    // ◆ OSMラスタタイルを使ったスタイル


    // ◆ MapLibre 地図（最初は古代蓮の里を中心に）
    const map = new maplibregl.Map({
  container: "map",
  style: "gyoda-style.json?v=20260721-1",
  center: [139.48, 36.13], // 行田市中心あたり
  zoom: 13,
  pitch: 0,     // ← 3D感
  bearing: 0  // ← 斜めから見る
});

map.addControl(new maplibregl.NavigationControl(), "top-right");    // ◆ ポップアップ & マーカー追加

  const routePanelEl = document.getElementById("route-panel") ?? (() => {
    const panel = document.createElement("aside");
    panel.id = "route-panel";
    panel.className = "route-panel";
    document.querySelector(".map-paper")?.appendChild(panel);
    return panel;
  })();
  routePanelEl.setAttribute("aria-label", "おすすめ観光ルート");
  routePanelEl.innerHTML = `
    <div class="route-panel-head">
      <span class="route-panel-label">おすすめ観光ルート</span>
      <label class="route-switch">
        <input id="route-visibility-toggle" type="checkbox" checked aria-label="主要観光地巡りコースの表示を切り替え">
        <span class="route-switch-track" aria-hidden="true"></span>
      </label>
    </div>
    <div class="route-name-row">
      <span class="route-line-sample" style="--route-color:${FEATURED_ROUTE.color}" aria-hidden="true"></span>
      <strong class="route-name">${FEATURED_ROUTE.name}</strong>
    </div>
    <div class="route-meta">全${featuredRouteSpots.length}スポット</div>
    <ol class="route-stop-list">
      ${featuredRouteSpots.map((spot, index) => `
        <li>
          <button class="route-stop-button" type="button" data-route-stop-index="${index}">
            <span class="route-stop-number">${index + 1}</span>
            <span class="route-stop-name">${spot.name}</span>
          </button>
        </li>
      `).join("")}
    </ol>
    <div class="route-action-row">
      <button class="route-story-start-button" type="button" data-start-route-story>
        順番にめぐる
      </button>
      <button class="route-google-button" type="button" data-open-route-google>
        Google Maps
      </button>
    </div>
    <div class="route-story-view" aria-live="polite" hidden>
      <div class="route-story-top">
        <span class="route-story-position" id="route-story-position"></span>
        <button class="route-story-close" type="button" data-exit-route-story aria-label="ストーリーモードを終了">&times;</button>
      </div>
      <div class="route-story-progress" aria-hidden="true">
        <span id="route-story-progress-bar"></span>
      </div>
      <p class="route-story-kicker">主要観光地巡り</p>
      <h2 class="route-story-title" id="route-story-title"></h2>
      <p class="route-story-description" id="route-story-description"></p>
      <div class="route-story-controls">
        <button class="route-story-back" type="button" data-route-story-back aria-label="前のスポットへ">←</button>
        <button class="route-story-next" type="button" data-route-story-next>次へ</button>
      </div>
    </div>
  `;

  function fitFeaturedRoute() {
    if (featuredRouteCoordinates.length < 2) return;

    const isMobile = mobilePanelMedia.matches;
    const isRoutePanelOpen = routePanelEl.classList.contains("is-mobile-open");

    const bounds = featuredRouteCoordinates.reduce(
      (routeBounds, coordinate) => routeBounds.extend(coordinate),
      new maplibregl.LngLatBounds(featuredRouteCoordinates[0], featuredRouteCoordinates[0])
    );

    map.fitBounds(bounds, {
      padding: isMobile
        ? isRoutePanelOpen
          ? { top: 116, right: 28, bottom: 230, left: 28 }
          : { top: 116, right: 28, bottom: 54, left: 28 }
        : { top: 125, right: 310, bottom: 70, left: 285 },
      maxZoom: 13.8,
      pitch: 38,
      bearing: -8,
      duration: 700
    });
  }

  function setFeaturedRouteVisibility(shouldShow, focusRoute = false) {
    isFeaturedRouteVisible = shouldShow;
    ["featured-route-casing", "featured-route-line"].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
      }
    });

    routeStopMarkers.forEach(({ element }) => {
      element.hidden = !shouldShow;
    });
    routePanelEl.classList.toggle("is-inactive", !shouldShow);

    const toggle = document.getElementById("route-visibility-toggle");
    if (toggle) toggle.checked = shouldShow;
    if (shouldShow && focusRoute) fitFeaturedRoute();
  }

  function openFeaturedRouteInGoogleMaps() {
    if (featuredRouteSpots.length < 2) return;

    const firstSpot = featuredRouteSpots[0];
    const lastSpot = featuredRouteSpots[featuredRouteSpots.length - 1];
    const waypoints = featuredRouteSpots
      .slice(1, -1)
      .map((spot) => `${spot.lat},${spot.lon}`)
      .join("|");
    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("origin", `${firstSpot.lat},${firstSpot.lon}`);
    url.searchParams.set("destination", `${lastSpot.lat},${lastSpot.lon}`);
    url.searchParams.set("travelmode", "walking");
    if (waypoints) url.searchParams.set("waypoints", waypoints);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  function updateRouteStoryMarkerState() {
    routeStopMarkers.forEach(({ element }, index) => {
      element.classList.toggle("is-current", isRouteStoryActive && index === routeStoryStepIndex);
    });

    routePanelEl.querySelectorAll(".route-stop-button").forEach((button, index) => {
      button.classList.toggle("is-current", isRouteStoryActive && index === routeStoryStepIndex);
    });
  }

  function showRouteStoryStep(nextIndex, animate = true) {
    const stepCount = featuredRouteStorySteps.length;
    if (!stepCount) return;

    routeStoryStepIndex = Math.max(0, Math.min(nextIndex, stepCount - 1));
    const step = featuredRouteStorySteps[routeStoryStepIndex];
    const positionEl = document.getElementById("route-story-position");
    const progressEl = document.getElementById("route-story-progress-bar");
    const titleEl = document.getElementById("route-story-title");
    const descriptionEl = document.getElementById("route-story-description");
    const backButton = routePanelEl.querySelector("[data-route-story-back]");
    const nextButton = routePanelEl.querySelector("[data-route-story-next]");

    if (positionEl) positionEl.textContent = `${routeStoryStepIndex + 1} / ${stepCount}`;
    if (progressEl) {
      progressEl.style.width = `${((routeStoryStepIndex + 1) / stepCount) * 100}%`;
    }
    if (titleEl) titleEl.textContent = step.name;
    if (descriptionEl) descriptionEl.textContent = step.description;
    if (backButton) backButton.disabled = routeStoryStepIndex === 0;
    if (nextButton) {
      nextButton.textContent =
        routeStoryStepIndex === stepCount - 1 ? "コースを終える" : "次へ";
    }

    updateRouteStoryMarkerState();

    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const cameraOptions = {
      center: [step.spot.lon, step.spot.lat],
      zoom: step.zoom,
      pitch: step.pitch,
      bearing: step.bearing,
      padding: isMobile
        ? { top: 88, right: 20, bottom: 250, left: 20 }
        : { top: 105, right: 315, bottom: 70, left: 270 },
      duration: animate ? 1700 : 0,
      essential: false,
      retainPadding: false
    };

    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.jumpTo(cameraOptions);
    } else {
      map.flyTo(cameraOptions);
    }
  }

  function startRouteStory() {
    if (!featuredRouteStorySteps.length) return;

    closeSpotPanel();
    setMobileMapPanel("route", true);
    setFeaturedRouteVisibility(true);
    isRouteStoryActive = true;
    routePanelEl.classList.add("is-story-active");
    document.body.classList.add("route-story-open");

    const storyView = routePanelEl.querySelector(".route-story-view");
    if (storyView) storyView.hidden = false;
    showRouteStoryStep(0);
  }

  function exitRouteStory(returnToOverview = true) {
    if (!isRouteStoryActive) return;

    isRouteStoryActive = false;
    routeStoryStepIndex = -1;
    routePanelEl.classList.remove("is-story-active");
    document.body.classList.remove("route-story-open");

    const storyView = routePanelEl.querySelector(".route-story-view");
    if (storyView) storyView.hidden = true;
    updateRouteStoryMarkerState();
    closeMobileMapPanels();
    if (returnToOverview) fitFeaturedRoute();
  }

  routePanelEl.addEventListener("change", (event) => {
    if (event.target.id !== "route-visibility-toggle") return;
    setFeaturedRouteVisibility(event.target.checked, event.target.checked);
  });

  routePanelEl.addEventListener("click", (event) => {
    event.stopPropagation();

    if (event.target.closest("[data-start-route-story]")) {
      startRouteStory();
      return;
    }

    if (event.target.closest("[data-exit-route-story]")) {
      exitRouteStory();
      return;
    }

    if (event.target.closest("[data-route-story-back]")) {
      showRouteStoryStep(routeStoryStepIndex - 1);
      return;
    }

    if (event.target.closest("[data-route-story-next]")) {
      if (routeStoryStepIndex >= featuredRouteStorySteps.length - 1) {
        exitRouteStory();
      } else {
        showRouteStoryStep(routeStoryStepIndex + 1);
      }
      return;
    }

    const stopButton = event.target.closest(".route-stop-button");
    if (stopButton) {
      const spot = featuredRouteSpots[Number(stopButton.dataset.routeStopIndex)];
      if (!spot) return;
      openSpotPanel(spot);
      map.easeTo({ center: [spot.lon, spot.lat], zoom: 14.7, duration: 650 });
      return;
    }

    if (event.target.closest("[data-open-route-google]")) {
      openFeaturedRouteInGoogleMaps();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!isRouteStoryActive) return;

    if (event.key === "Escape") {
      exitRouteStory();
    } else if (event.key === "ArrowLeft" && routeStoryStepIndex > 0) {
      showRouteStoryStep(routeStoryStepIndex - 1);
    } else if (event.key === "ArrowRight") {
      if (routeStoryStepIndex >= featuredRouteStorySteps.length - 1) {
        exitRouteStory();
      } else {
        showRouteStoryStep(routeStoryStepIndex + 1);
      }
    }
  });

   // 凡例を描画
  const categoryMarkers = Object.fromEntries(
    Object.keys(CATEGORY).map((key) => [key, []])
  );
  const activeCategories = new Set(Object.keys(CATEGORY));
  const TOURISM_AREA_LAYER_IDS = [
    "tourism-area-history-glow",
    "tourism-area-kofun-glow",
    "tourism-area-lotus-glow",
    "tourism-area-label"
  ];
  let tourismAreasVisible = true;
  const legendEl = document.getElementById("legend");
  legendEl.innerHTML = `
  <div class="legend-title"></div>
  <div class="legend-filter-group">
    ${Object.entries(CATEGORY).map(([key, c]) => `
      <button class="legend-item legend-toggle" type="button" data-category="${key}" aria-pressed="true" aria-label="${c.label}の表示を切り替え">
        <span class="legend-icon legend-icon-${key}" style="--marker-color:${c.color}" aria-hidden="true">
          ${createLegendIcon(key)}
        </span>
        <span class="legend-label">${c.label}</span>
      </button>
    `).join("")}
  </div>
  <div class="map-layer-control">
    <button class="legend-item tourism-area-toggle" type="button" aria-pressed="true" aria-label="観光エリアの表示を切り替え">
      <span class="legend-icon tourism-area-legend-icon" aria-hidden="true">
        <span class="tourism-area-swatch tourism-area-swatch-history"></span>
        <span class="tourism-area-swatch tourism-area-swatch-kofun"></span>
        <span class="tourism-area-swatch tourism-area-swatch-lotus"></span>
      </span>
      <span class="legend-label">観光エリア</span>
    </button>
  </div>
  <div class="visible-spot-list" aria-live="polite">
    <div class="visible-spot-list-head">
      <span>表示中スポット</span>
      <span class="visible-spot-count" id="visible-spot-count"></span>
    </div>
    <div class="visible-spot-list-body" id="visible-spot-list"></div>
  </div>
`;

  legendEl.addEventListener("click", (event) => {
    event.stopPropagation();

    const listButton = event.target.closest(".spot-list-item");
    if (listButton) {
      const spot = spots[Number(listButton.dataset.spotIndex)];
      if (!spot) return;

      openSpotPanel(spot);
      map.easeTo({
        center: [spot.lon, spot.lat],
        zoom: Math.max(map.getZoom(), 14.5),
        duration: 650
      });
      return;
    }

    const areaButton = event.target.closest(".tourism-area-toggle");
    if (areaButton) {
      tourismAreasVisible = !tourismAreasVisible;
      setTourismAreasVisibility(tourismAreasVisible);
      return;
    }

    const button = event.target.closest(".legend-toggle");
    if (!button) return;

    const categoryKey = button.dataset.category;
    if (!categoryKey) return;

    if (activeCategories.has(categoryKey)) {
      activeCategories.delete(categoryKey);
    } else {
      activeCategories.add(categoryKey);
    }

    updateCategoryVisibility(categoryKey);
    updateLegendButtonState();
    renderVisibleSpotList();
  });

  function updateCategoryVisibility(categoryKey) {
    const shouldShow = activeCategories.has(categoryKey);
    const entries = categoryMarkers[categoryKey] ?? [];

    entries.forEach((entry) => {
      if (shouldShow && !entry.visible) {
        entry.marker.addTo(map);
        entry.visible = true;
      } else if (!shouldShow && entry.visible) {
        entry.marker.remove();
        entry.visible = false;
      }
    });

    if (!shouldShow) closeSpotPanel();
  }

  function setTourismAreasVisibility(shouldShow) {
    TOURISM_AREA_LAYER_IDS.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", shouldShow ? "visible" : "none");
      }
    });

    const button = legendEl.querySelector(".tourism-area-toggle");
    if (!button) return;
    button.classList.toggle("is-muted", !shouldShow);
    button.setAttribute("aria-pressed", String(shouldShow));
  }

  function updateLegendButtonState() {
    legendEl.querySelectorAll(".legend-toggle").forEach((button) => {
      const isActive = activeCategories.has(button.dataset.category);
      button.classList.toggle("is-muted", !isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function renderVisibleSpotList() {
    const listEl = document.getElementById("visible-spot-list");
    const countEl = document.getElementById("visible-spot-count");
    if (!listEl || !countEl) return;

    const visibleSpots = spots
      .map((spot, index) => ({ spot, index }))
      .filter(({ spot }) => activeCategories.has(spot.category));

    countEl.textContent = `${visibleSpots.length}件`;
    listEl.innerHTML = visibleSpots.length
      ? visibleSpots.map(({ spot, index }) => {
          const category = CATEGORY[spot.category] ?? { label: "その他", color: "#64748b" };
          return `
            <button class="spot-list-item" type="button" data-spot-index="${index}" style="--marker-color:${category.color}">
              <span class="spot-list-category">${category.label}</span>
              <span class="spot-list-name">${spot.name}</span>
            </button>
          `;
        }).join("")
      : `<div class="spot-list-empty">表示中のスポットはありません</div>`;
  }

  renderVisibleSpotList();
map.on("load", () => {
  // ===== 観光テーマエリア（境界のないグラデーション） =====
  map.addSource("tourism-areas", {
    type: "geojson",
    data: "./tourism-areas.geojson?v=20260721-1"
  });

  map.addSource("tourism-area-glow-points", {
    type: "geojson",
    data: "./tourism-area-glow.geojson?v=20260721-1"
  });

  const firstBaseLabelLayerId = map.getStyle().layers
    .find((layer) => layer.type === "symbol")?.id;

  function addTourismAreaGlow(id, areaId, colorStops) {
    map.addLayer(
      {
        id,
        type: "heatmap",
        source: "tourism-area-glow-points",
        filter: ["==", ["get", "areaId"], areaId],
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["get", "weight"],
            0.65, 0.65,
            1, 1
          ],
          "heatmap-intensity": [
            "interpolate", ["linear"], ["zoom"],
            11, 0.92,
            13, 1.28,
            15, 1.56
          ],
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            11, 30,
            13, 54,
            15, 80
          ],
          "heatmap-opacity": [
            "interpolate", ["linear"], ["zoom"],
            11, 0.88,
            13, 1,
            16, 0.9
          ],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, colorStops[0],
            0.18, colorStops[1],
            0.4, colorStops[2],
            0.65, colorStops[3],
            0.85, colorStops[4],
            1, colorStops[5]
          ]
        }
      },
      firstBaseLabelLayerId
    );
  }

  addTourismAreaGlow("tourism-area-history-glow", "castle-town", [
    "rgba(206, 91, 124, 0)",
    "rgba(206, 91, 124, 0.15)",
    "rgba(206, 91, 124, 0.32)",
    "rgba(206, 91, 124, 0.53)",
    "rgba(206, 91, 124, 0.7)",
    "rgba(206, 91, 124, 0.85)"
  ]);

  addTourismAreaGlow("tourism-area-kofun-glow", "sakitama-kofun", [
    "rgba(99, 143, 73, 0)",
    "rgba(99, 143, 73, 0.15)",
    "rgba(99, 143, 73, 0.32)",
    "rgba(99, 143, 73, 0.53)",
    "rgba(99, 143, 73, 0.7)",
    "rgba(99, 143, 73, 0.85)"
  ]);

  addTourismAreaGlow("tourism-area-lotus-glow", "ancient-lotus", [
    "rgba(57, 145, 150, 0)",
    "rgba(57, 145, 150, 0.15)",
    "rgba(57, 145, 150, 0.32)",
    "rgba(57, 145, 150, 0.53)",
    "rgba(57, 145, 150, 0.7)",
    "rgba(57, 145, 150, 0.85)"
  ]);

  map.addLayer({
    id: "tourism-area-label",
    type: "symbol",
    source: "tourism-areas",
    minzoom: 12.4,
    layout: {
      "text-field": ["get", "name"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        12.4, 11,
        14.5, 14
      ],
      "text-max-width": 8,
      "text-allow-overlap": false
    },
    paint: {
      "text-color": ["get", "labelColor"],
      "text-opacity": 0.92,
      "text-halo-color": "rgba(255, 248, 230, 0.94)",
      "text-halo-width": 1.8,
      "text-halo-blur": 0.5
    }
  });

  setTourismAreasVisibility(tourismAreasVisible);

  // ===== 行田市 境界線（GeoJSON） =====
  map.addSource("gyoda-boundary", {
    type: "geojson",
    data: "./gyoda_geojson.geojson?v=20260721-1"
  });

  map.addLayer({
    id: "gyoda-boundary-fill",
    type: "fill",
    source: "gyoda-boundary",
    paint: {
      "fill-color": "#b22222",
      "fill-opacity": 0.00
    }
  });

  map.addLayer({
    id: "gyoda-boundary-line",
    type: "line",
    source: "gyoda-boundary",
    paint: {
      "line-color": "#565138",
      "line-width": 5
    }
  });

  map.addSource("featured-route", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: { name: FEATURED_ROUTE.name },
      geometry: {
        type: "LineString",
        coordinates: featuredRouteCoordinates
      }
    }
  });

  map.addLayer({
    id: "featured-route-casing",
    type: "line",
    source: "featured-route",
    layout: {
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": "#fff5dc",
      "line-width": 9,
      "line-opacity": 0.88
    }
  });

  map.addLayer({
    id: "featured-route-line",
    type: "line",
    source: "featured-route",
    layout: {
      "line-cap": "round",
      "line-join": "round"
    },
    paint: {
      "line-color": FEATURED_ROUTE.color,
      "line-width": 4.5,
      "line-opacity": 0.92,
      "line-dasharray": [1.6, 1.2]
    }
  });

  setFeaturedRouteVisibility(isFeaturedRouteVisible);
  // ===== ここから下は既存のスポット処理 =====


});

function createLegendIcon(categoryKey) {
  if (categoryKey === "sightseeing") {
    return `
      <svg class="tourism-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="tourism-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <circle class="tourism-marker-dot" cx="22" cy="15" r="5.5" />
        <circle class="tourism-marker-dot" cx="15" cy="29" r="5.5" />
        <circle class="tourism-marker-dot" cx="29" cy="29" r="5.5" />
      </svg>
    `;
  }

  if (categoryKey === "food") {
    return `
      <svg class="food-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="food-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="food-marker-fork" d="M15 10v10.5M11.8 10v9.2M18.2 10v9.2M11.8 19.2c0 2.1 1.3 3.8 3.2 4.3v10.3" />
        <path class="food-marker-spoon" d="M28.5 10c3.1 0 5.1 2.8 5.1 6.3c0 3-1.4 5.2-3.6 6v11.5M28.5 10c-3.1 0-5.1 2.8-5.1 6.3c0 3 1.4 5.2 3.6 6v11.5" />
      </svg>
    `;
  }

  if (categoryKey === "onsen") {
    return `
      <svg class="onsen-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="onsen-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="onsen-marker-steam" d="M15.5 8.5c-2.1 3.1 2.4 4.7 0 8.1" />
        <path class="onsen-marker-steam" d="M22 7.2c-2.3 3.4 2.7 5.1 0 8.9" />
        <path class="onsen-marker-steam" d="M28.5 8.5c-2.1 3.1 2.4 4.7 0 8.1" />
        <path class="onsen-marker-water" d="M10.5 24.2c2.5 4.8 20.5 4.8 23 0" />
        <path class="onsen-marker-bath" d="M13 21.2c2.8 2.5 15.2 2.5 18 0" />
      </svg>
    `;
  }

  if (categoryKey === "souvenir") {
    return `
      <svg class="souvenir-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="souvenir-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="souvenir-marker-handle" d="M16 20v-5.2c0-4 2.6-6.8 6-6.8s6 2.8 6 6.8V20" />
        <path class="souvenir-marker-bag" d="M12.4 18.5h19.2l2 15.5H10.4l2-15.5Z" />
      </svg>
    `;
  }

  if (categoryKey === "station") {
    return `
      <svg class="station-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="station-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="station-marker-train" d="M13 12.5c0-2.2 1.8-4 4-4h10c2.2 0 4 1.8 4 4v15.2c0 2-1.6 3.6-3.6 3.6H16.6c-2 0-3.6-1.6-3.6-3.6V12.5Z" />
        <path class="station-marker-window" d="M16.5 13h11v7.4h-11Z" />
        <circle class="station-marker-light" cx="17.4" cy="26.1" r="2" />
        <circle class="station-marker-light" cx="26.6" cy="26.1" r="2" />
        <path class="station-marker-rail" d="M17 35.2l3.2-4M27 35.2l-3.2-4" />
      </svg>
    `;
  }

  return `<span class="legend-pin"></span>`;
}
function createCustomMarkerElement(spot, category) {
  if (spot.category === "sightseeing") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "custom-marker tourism-marker";
    el.title = spot.name;
    el.setAttribute("aria-label", spot.name);
    el.style.setProperty("--marker-color", category.color);
    el.innerHTML = `
      <svg class="tourism-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="tourism-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <circle class="tourism-marker-dot" cx="22" cy="15" r="5.5" />
        <circle class="tourism-marker-dot" cx="15" cy="29" r="5.5" />
        <circle class="tourism-marker-dot" cx="29" cy="29" r="5.5" />
      </svg>
    `;
    return el;
  }

  if (spot.category === "food") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "custom-marker food-marker";
    el.title = spot.name;
    el.setAttribute("aria-label", spot.name);
    el.style.setProperty("--marker-color", category.color);
    el.innerHTML = `
      <svg class="food-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="food-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="food-marker-fork" d="M15 10v10.5M11.8 10v9.2M18.2 10v9.2M11.8 19.2c0 2.1 1.3 3.8 3.2 4.3v10.3" />
        <path class="food-marker-spoon" d="M28.5 10c3.1 0 5.1 2.8 5.1 6.3c0 3-1.4 5.2-3.6 6v11.5M28.5 10c-3.1 0-5.1 2.8-5.1 6.3c0 3 1.4 5.2 3.6 6v11.5" />
      </svg>
    `;
    return el;
  }

  if (spot.category === "onsen") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "custom-marker onsen-marker";
    el.title = spot.name;
    el.setAttribute("aria-label", spot.name);
    el.style.setProperty("--marker-color", category.color);
    el.innerHTML = `
      <svg class="onsen-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="onsen-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="onsen-marker-steam" d="M15.5 8.5c-2.1 3.1 2.4 4.7 0 8.1" />
        <path class="onsen-marker-steam" d="M22 7.2c-2.3 3.4 2.7 5.1 0 8.9" />
        <path class="onsen-marker-steam" d="M28.5 8.5c-2.1 3.1 2.4 4.7 0 8.1" />
        <path class="onsen-marker-water" d="M10.5 24.2c2.5 4.8 20.5 4.8 23 0" />
        <path class="onsen-marker-bath" d="M13 21.2c2.8 2.5 15.2 2.5 18 0" />
      </svg>
    `;
    return el;
  }

  if (spot.category === "souvenir") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "custom-marker souvenir-marker";
    el.title = spot.name;
    el.setAttribute("aria-label", spot.name);
    el.style.setProperty("--marker-color", category.color);
    el.innerHTML = `
      <svg class="souvenir-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="souvenir-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="souvenir-marker-handle" d="M16 20v-5.2c0-4 2.6-6.8 6-6.8s6 2.8 6 6.8V20" />
        <path class="souvenir-marker-bag" d="M12.4 18.5h19.2l2 15.5H10.4l2-15.5Z" />
      </svg>
    `;
    return el;
  }

  if (spot.category === "station") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "custom-marker station-marker";
    el.title = spot.name;
    el.setAttribute("aria-label", spot.name);
    el.style.setProperty("--marker-color", category.color);
    el.innerHTML = `
      <svg class="station-marker-icon" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
        <rect class="station-marker-bg" x="3" y="3" width="38" height="38" rx="7" />
        <path class="station-marker-train" d="M13 12.5c0-2.2 1.8-4 4-4h10c2.2 0 4 1.8 4 4v15.2c0 2-1.6 3.6-3.6 3.6H16.6c-2 0-3.6-1.6-3.6-3.6V12.5Z" />
        <path class="station-marker-window" d="M16.5 13h11v7.4h-11Z" />
        <circle class="station-marker-light" cx="17.4" cy="26.1" r="2" />
        <circle class="station-marker-light" cx="26.6" cy="26.1" r="2" />
        <path class="station-marker-rail" d="M17 35.2l3.2-4M27 35.2l-3.2-4" />
      </svg>
    `;
    return el;
  }

  return null;
}

     spots.forEach((spot) => {
  const c = CATEGORY[spot.category] ?? { label: "その他", color: "#64748b" };

  const markerEl = createCustomMarkerElement(spot, c);
  const markerColor =
    spot.category === "sightseeing"
      ? "#f3a8c8"
      : c.color ?? spot.color;
  const marker = new maplibregl.Marker(
      markerEl
        ? { element: markerEl, anchor: "center" }
        : { color: markerColor }
    )
    .setLngLat([spot.lon, spot.lat])
    .addTo(map);
  const categoryKey = spot.category;
  if (!categoryMarkers[categoryKey]) categoryMarkers[categoryKey] = [];
  categoryMarkers[categoryKey].push({ marker, visible: true });

  marker.getElement().addEventListener("click", (e) => {
    e.stopPropagation();
    if (isRouteStoryActive) exitRouteStory(false);
    openSpotPanel(spot);
  });
});

featuredRouteSpots.forEach((spot, index) => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "route-stop-marker";
  element.textContent = String(index + 1);
  element.title = `${index + 1}. ${spot.name}`;
  element.setAttribute("aria-label", `${index + 1}番目 ${spot.name}`);
  element.classList.toggle("is-current", isRouteStoryActive && index === routeStoryStepIndex);

  const marker = new maplibregl.Marker({
    element,
    anchor: "center",
    offset: [19, -19]
  })
    .setLngLat([spot.lon, spot.lat])
    .addTo(map);

  element.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isRouteStoryActive) {
      showRouteStoryStep(index);
    } else {
      openSpotPanel(spot);
    }
  });
  routeStopMarkers.push({ marker, element });
});

map.on("click", () => {
  closeSpotPanel();
  closeMobileMapPanels();
});
