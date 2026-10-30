function buildPopupHtml(spot, { preview = false } = {}) {
  const { escapeHtml: escape, safeUrl, youtubeEmbed } = GyodaSpotData;
  const title = `<div class="popup-title">${escape(spot.name)}</div>`;
  const desc = spot.desc ? `<div class="popup-desc">${escape(spot.desc)}</div>` : "";
  const photoUrl = safeUrl(spot.photo, true);
  const photo = photoUrl
    ? `<img src="${escape(photoUrl)}" class="popup-img" alt="${escape(spot.name)}" loading="lazy" />` : "";
  const shortEmbed = youtubeEmbed(spot.youtube2);
  const shortVideo = shortEmbed ? `
    <div class="popup-video popup-video-vertical">
      <iframe src="${shortEmbed}" title="YouTube Shorts" loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
    </div>` : "";
  const vlogUrl = safeUrl(spot.youtube);
  const vlogLink = vlogUrl ? `
    <a class="popup-vlog-link" href="${escape(vlogUrl)}" target="_blank" rel="noopener noreferrer">
      ▶︎ YouTubeで詳しくみる
    </a>` : "";
  const homepageUrl = safeUrl(spot.homepage);
  const linksHtml = homepageUrl ? `
    <div class="popup-links"><a href="${escape(homepageUrl)}" target="_blank" rel="noopener noreferrer">詳しい情報はこちら</a></div>` : "";
  const routeAction = !preview && Number.isFinite(spot.lat) && Number.isFinite(spot.lon)
    ? `onclick="openGoogleMapsRoute(${spot.lat}, ${spot.lon})"` : "disabled";
  return `
    <div style="max-width:300px">
      ${title}${desc}${shortVideo}${photo}${linksHtml}${vlogLink}
      <button class="google-route-btn" type="button" ${routeAction}>Google Mapで道案内</button>
      <button class="spot-feedback-btn" type="button" ${preview ? "disabled" : ""}>このスポットの声を送る</button>
    </div>`;
}
