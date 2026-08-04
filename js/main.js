navigator.geolocation.getCurrentPosition(
  (pos) => {
    currentLocation = [pos.coords.latitude, pos.coords.longitude];
  },
  () => {
    alert("現在地を取得できませんでした");
  }
);
const panelEl = document.getElementById("spot-panel");
const panelBodyEl = document.getElementById("spot-panel-body");
const panelCloseEl = document.getElementById("spot-panel-close");

function openSpotPanel(spot){
  if (!panelEl || !panelBodyEl) return;
  panelBodyEl.innerHTML = buildPopupHtml(spot); // ← 今のカードHTMLをそのまま再利用
  panelEl.classList.remove("is-hidden");
}

function closeSpotPanel(){
  if (!panelEl) return;
  panelEl.classList.add("is-hidden");
  if (panelBodyEl) panelBodyEl.innerHTML = "";
}

if (panelCloseEl){
  panelCloseEl.addEventListener("click", closeSpotPanel);
}

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

  return `
    <div style="max-width:300px">
      ${title}
      ${desc}
      ${shortVideo}
      ${photo}
      ${linksHtml}
      ${vlogLink}
      ${googleRouteBtn}
    </div>
  `;
}


    // ◆ 観光スポット配列
    const CATEGORY = {
  sightseeing: { label: "観光施設", color: "#22c55e" }, // 緑
  food:       { label: "飲食店",   color: "#ef4444" }, // 赤
  station:    { label: "駅",       color: "#2563eb" },  // 青（必要なら）
  onsen:   {label:"温泉",  color:"#FFEC50"},
  souvenir:{label:"お土産", color:"#F79428"}
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
       
        homepage: "https://www.gyoda-kankoukyoukai.jp/spot/973",
        desc:"行田市の歴史を学ぶことができる博物館。そのまま忍城の中も見学できます！"
      },
      {
        name: "JR行田駅",
      　lat:36.11381256998107,
        lon: 139.43219535581972,
        color: "#2563eb",
        desc:"JR高崎線の駅。大宮まで約40分、上野・東京・新宿・渋谷などの都内主要駅から乗り換えなしでアクセス可能！"
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

    // ◆ OSMラスタタイルを使ったスタイル
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

    // ◆ MapLibre 地図（最初は古代蓮の里を中心に）
    const map = new maplibregl.Map({
  container: "map",
  style: osmStyle,
  center: [139.48, 36.13], // 行田市中心あたり
  zoom: 13,
  pitch: 0,     // ← 3D感
  bearing: 0  // ← 斜めから見る
});

map.addControl(new maplibregl.NavigationControl(), "top-right");


    // ◆ ポップアップ & マーカー追加
   // 凡例を描画
  const legendEl = document.getElementById("legend");
  legendEl.innerHTML = `
  <div class="legend-title"></div>
  ${Object.values(CATEGORY).map(c => `
    <div class="legend-item">
      <span class="legend-pin" style="background:${c.color}"></span>
      <span>${c.label}</span>
    </div>
  `).join("")}
`;

    map.on("load", () => {
  // ===== 行田市 境界線（GeoJSON） =====
  map.addSource("gyoda-boundary", {
    type: "geojson",
    data: "./data/gyoda_geojson.geojson"   // ★拡張子つける
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
      "line-color": "#b22222",
      "line-width": 5
    }
  });
  // ===== ここから下は既存のスポット処理 =====
  

});

     spots.forEach((spot) => {
  const c = CATEGORY[spot.category] ?? { label: "その他", color: "#64748b" };

  const marker = new maplibregl.Marker({ color: spot.color ?? c.color })
    .setLngLat([spot.lon, spot.lat])
    .addTo(map);

  marker.getElement().addEventListener("click", (e) => {
    e.stopPropagation();
    openSpotPanel(spot);
  });
});
map.on("click", () => closeSpotPanel());




 


