let currentLocation = null;

navigator.geolocation.getCurrentPosition(
  (pos) => {
    currentLocation = [pos.coords.latitude, pos.coords.longitude];
  },
  () => {
    alert("現在地を取得できませんでした");
  }
);

function openGoogleMapsRoute(destLat, destLon) {
  if (!currentLocation) {
    alert("現在地が取得できていません");
    return;
  }

  const origin = currentLocation.join(",");
  const destination = `${destLat},${destLon}`;

  const url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin}` +
    `&destination=${destination}` +
    `&travelmode=walking`;

  window.open(url, "_blank");
}

function buildPopupHtml(spot) {
  const title = `<div class="popup-title">${spot.name}</div>`;

  const desc = spot.desc
    ? `<div class="popup-desc">${spot.desc}</div>`
    : "";

  const photo = spot.photo
    ? `<img src="${spot.photo}" class="popup-img" alt="${spot.name}" loading="lazy" />`
    : "";

  const links = [
    spot.homepage
      ? `<a href="${spot.homepage}" target="_blank" rel="noopener noreferrer">公式サイトはこちら</a>`
      : "",
    spot.youtube
      ? `<a href="${spot.youtube}" target="_blank" rel="noopener noreferrer">YouTubeを見る</a>`
      : "",
    spot.youtube2
      ? `<a href="${spot.youtube2}" target="_blank" rel="noopener noreferrer">ショート動画を見る</a>`
      : ""
  ].filter(Boolean);

  const linksHtml = links.length
    ? `<div class="popup-links">${links.join("<br>")}</div>`
    : "";

  const googleRouteBtn = `
    <button class="google-route-btn" onclick="openGoogleMapsRoute(${spot.lat}, ${spot.lon})">
      Google Mapで道案内
    </button>
  `;

  return `
    <div style="max-width:300px">
      ${title}
      ${desc}
      ${photo}
      ${linksHtml}
      ${googleRouteBtn}
    </div>
  `;
}

// ◆ 観光スポット配列
const CATEGORY = {
  sightseeing: { label: "観光施設", color: "#22c55e" },
  food:       { label: "飲食店",   color: "#ef4444" },
  station:    { label: "駅",       color: "#2563eb" },
  onsen:      { label: "温泉",     color: "#FFEC50" },
  souvenir:   { label: "お土産",   color: "#F79428" }
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
    youtube: "https://youtu.be/F4jcAJ014tU?si=7B2PC2OLNnX6_edu",
    homepage: "https://www.gyoda-kankoukyoukai.jp/spot/973"
  },
  {
    name: "JR行田駅",
    lat: 36.11381256998107,
    lon: 139.43219535581972,
    category: "station",
    color: "#2563eb",
    desc: "JR高崎線の駅。大宮まで約40分、上野・東京・新宿・渋谷などの都内主要駅から乗り換えなしでアクセス可能！"
  },
  {
    name: "水城公園",
    lat: 36.13483418826252,
    lon: 139.45874369551495,
    category: "sightseeing",
    color: "#22c55e"
  },
  {
    name: "行田八幡神社",
    lat: 36.13906,
    lon: 139.46147,
    category: "sightseeing",
    color: "#22c55e",
    homepage:"https://www.gyoda-kankoukyoukai.jp/spot/1004"
  },
  {
    name: "足袋とくらしの博物館",
    lat: 36.14087,
    lon: 139.45810,
    category: "sightseeing",
    color: "#22c55e"
  },
  {
    name: "行田・湯本天然温泉 茂美の湯",
    lat: 36.12744,
    lon: 139.47235,
    category: "onsen",
    color: "#FFEC50"
  },
  {
    name: "前玉(さきたま)神社",
    lat: 36.12336088024693,
    lon: 139.47963882213634,
    category: "sightseeing",
    color: "#22c55e",
    photo:"https://github.com/user-attachments/assets/5121549f-5275-4281-8a67-70ecdb09758e",
    youtube2:"https://youtube.com/shorts/aWfyMtGJwGM?si=SQ0PCV78lAXAI4vR"
  },
  {
    name: "かねつき堂",
    lat: 36.13895781856619,
    lon: 139.45167731963446,
    category: "food",
    color: "#ef4444"
  },
  {
    name: "金澤製菓",
    lat: 36.12414197823914,
    lon: 139.48043697306653,
    category: "souvenir",
    color: "#F79428"
  },
  {
    name: "十万石ふくさや 行田本店",
    lat: 36.141301805501094,
    lon: 139.46101358575336,
    category: "souvenir",
    color: "#F79428"
  },
  {
    name: "行田天然温泉 古代蓮物語",
    lat: 36.13592755579241,
    lon: 139.46549395962916,
    category: "onsen",
    color: "#FFEC50"
  },
  {
    name: "城西ラーメン",
    lat: 36.13602502473986,
    lon: 139.4463881848658,
    category: "food",
    color: "#ef4444"
  },
  {
    name: "フライ・焼きそばの店 山下",
    lat: 36.11590685683875,
    lon: 139.46001279507158,
    category: "food",
    color: "#ef4444"
  }
];

// ◆ OSMラスタタイルを使ったスタイル（APIキー不要）
const osmStyle = {
  version: 8,
  sources: {
    "osm-tiles": {
      type: "raster",
      tiles: [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm-tiles",
      minzoom: 0,
      maxzoom: 19
    }
  ]
};



// 凡例を描画
const legendEl = document.getElementById("legend");
legendEl.innerHTML = `
  <div class="legend-title">凡例</div>
  ${Object.values(CATEGORY).map(c => `
    <div class="legend-item">
      <span class="legend-pin" style="background:${c.color}; color:${c.color}"></span>
      <span>${c.label}</span>
    </div>
  `).join("")}
`;

map.on("load", () => {
  // ===== 行田市 境界線（GeoJSON） =====
  map.addSource("gyoda-boundary", {
    type: "geojson",
    data: "./data/gyoda_geojson.geojson"
  });

  map.addLayer({
    id: "gyoda-boundary-fill",
    type: "fill",
    source: "gyoda-boundary",
    paint: {
      "fill-color": "#b22222",
      "fill-opacity": 0.0
    }
  });

  map.addLayer({
    id: "gyoda-boundary-line",
    type: "line",
    source: "gyoda-boundary",
    paint: {
      "line-color": "#b22222",
      "line-width": 5
    }
  });
});

// スポット描画
spots.forEach((spot) => {
  const c = CATEGORY[spot.category] ?? { label: "その他", color: "#64748b" };
  const popup = new maplibregl.Popup({ offset: 16 }).setHTML(buildPopupHtml(spot));

  new maplibregl.Marker({ color: spot.color ?? c.color })
    .setLngLat([spot.lon, spot.lat])
    .setPopup(popup)
    .addTo(map);
});
