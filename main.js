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
let mapPreviewActive = false;

function openSpotPanel(spot){
  if (!panelEl || !panelBodyEl) return;
  activeSpot = spot;
  closeMobileMapPanels();
  panelBodyEl.innerHTML = buildPopupHtml(spot, { preview: mapPreviewActive });
  panelEl.classList.remove("is-hidden");
  document.body.classList.add("spot-panel-open");
}

function closeSpotPanel(){
  if (!panelEl) return;
  panelEl.classList.add("is-hidden");
  document.body.classList.remove("spot-panel-open");
  if (panelBodyEl) panelBodyEl.innerHTML = "";
}

panelBodyEl?.addEventListener("click", (event) => {
  const button = event.target.closest(".spot-feedback-btn");
  if (!button || !activeSpot) return;
  openFeedbackForm(activeSpot.name);
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

    // ◆ 観光スポット配列
const CATEGORY = GyodaSpotData.categories;

async function initializeMap() {
    const spots = await GyodaSpotData.load();
    const previewSnapshot = GyodaMapPreview.read(spots);
    if (previewSnapshot) {
      spots.splice(0, spots.length, ...previewSnapshot.spots);
      mapPreviewActive = true;
      GyodaMapPreview.banner(previewSnapshot);
    } else if (window.GyodaPublicationData) {
      const publishedSpots = await GyodaPublicationData.load(spots);
      spots.splice(0, spots.length, ...publishedSpots);
    }

    // IDs are permanent: do not renumber on reorder or reuse deleted IDs.
    const spotsById = new Map();
    spots.forEach((spot) => {
      if (!/^spot-\d{3,}$/.test(spot.id) || spotsById.has(spot.id)) {
        throw new Error(`Missing, invalid or duplicate spot ID: ${spot.id}`);
      }
      spotsById.set(spot.id, spot);
    });

    function requireSpot(id) {
      const spot = spotsById.get(id);
      if (!spot) throw new Error(`Unknown spot ID: ${id}`);
      return spot;
    }

    const FEATURED_ROUTE = {
      id: "major-sights",
      name: "主要観光地巡り",
      color: "#b65478",
      spotIds: [
        "spot-005",
        "spot-003",
        "spot-002",
        "spot-001"
      ]
    };

    const FEATURED_ROUTE_STORY = [
      {
        spotId: "spot-005",
        description: "行田のまち歩きはここから。駅を出て、城下町の歴史をたどる旅を始めます。",
        zoom: 15.3,
        pitch: 56,
        bearing: -24
      },
      {
        spotId: "spot-003",
        description: "城下町の中心に建つ忍城。水に囲まれた地形と、現在の市街地との関係を眺めます。",
        zoom: 15.5,
        pitch: 58,
        bearing: 22
      },
      {
        spotId: "spot-002",
        description: "市街地から古墳群へ。大きな墳丘が集まる、行田を代表する古代の景観です。",
        zoom: 14.8,
        pitch: 57,
        bearing: -28
      },
      {
        spotId: "spot-001",
        description: "旅の終点は古代蓮の里。水辺と田園の中に広がる、行田らしい季節の風景です。",
        zoom: 15.1,
        pitch: 55,
        bearing: 26
      }
    ];

    const featuredRouteSpots = FEATURED_ROUTE.spotIds.map(requireSpot);
    const featuredRouteCoordinates = featuredRouteSpots.map((spot) => [spot.lon, spot.lat]);
    const featuredRouteStorySteps = FEATURED_ROUTE_STORY
      .map((step) => {
        const spot = featuredRouteSpots.find((candidate) => candidate.id === step.spotId);
        if (!spot) throw new Error(`Story spot is not in route: ${step.spotId}`);
        return { ...step, spot };
      });
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
            <span class="route-stop-name">${GyodaSpotData.escapeHtml(spot.name)}</span>
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
    if (titleEl) titleEl.textContent = step.spot.name;
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
      const spot = spotsById.get(listButton.dataset.spotId);
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

    const visibleSpots = spots.filter((spot) => activeCategories.has(spot.category));

    countEl.textContent = `${visibleSpots.length}件`;
    listEl.innerHTML = visibleSpots.length
      ? visibleSpots.map((spot) => {
          const category = CATEGORY[spot.category] ?? { label: "その他", color: "#64748b" };
          return `
            <button class="spot-list-item" type="button" data-spot-id="${spot.id}" style="--marker-color:${category.color}">
              <span class="spot-list-category">${category.label}</span>
              <span class="spot-list-name">${GyodaSpotData.escapeHtml(spot.name)}</span>
            </button>
          `;
        }).join("")
      : `<div class="spot-list-empty">表示中のスポットはありません</div>`;
  }

  renderVisibleSpotList();
map.on("load", () => {
  if (previewSnapshot) GyodaMapPreview.install(map, previewSnapshot);
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

map.on("click", (event) => {
  const feature = GyodaMapPreview.pick(map, event.point, previewSnapshot);
  if (feature) {
    if (isRouteStoryActive) exitRouteStory(false);
    activeSpot = null;
    closeMobileMapPanels();
    const escape = GyodaSpotData.escapeHtml;
    panelBodyEl.innerHTML = `<div class="popup-title">${escape(feature.gyoda.name)}</div>
      <p class="popup-kind">${escape(GyodaGeoJSON.kinds[feature.geometry.type])} / ${escape(GyodaGeoJSON.categories[feature.gyoda.category])}</p>
      <div class="popup-desc">${escape(feature.gyoda.description)}</div>`;
    panelEl.classList.remove("is-hidden");
    document.body.classList.add("spot-panel-open");
    return;
  }
  closeSpotPanel();
  closeMobileMapPanels();
});

}

initializeMap().catch((error) => {
  console.error(error);
  const notice = document.createElement("p");
  notice.className = "map-load-error";
  notice.setAttribute("role", "alert");
  notice.textContent = new URLSearchParams(location.search).has("preview")
    ? `プレビューを開けませんでした。${error.message}`
    : "スポット情報を読み込めませんでした。ページを再読み込みしてください。";
  document.querySelector(".map-paper")?.appendChild(notice);
});
