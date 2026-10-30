const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const data = require("../js/spot-data.js");
const spots = require("../data/spots.json");
const context = vm.createContext({ GyodaSpotData: data, Number });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/spot-card.js"), "utf8"), context);

test("extracted data validates without changing existing values", () => {
  assert.equal(data.validate(spots), spots);
  assert.deepEqual(data.mergeEditable(spots, structuredClone(spots)), spots);
});
test("editable fields merge by ID, not name or order", () => {
  const edited = structuredClone(spots).reverse();
  edited[0].name = "Updated";
  edited[0].desc = "Line one\nLine two";
  const result = data.mergeEditable(spots, edited);
  assert.equal(result.find(spot => spot.id === edited[0].id).name, "Updated");
  assert.deepEqual(result.map(spot => spot.id), spots.map(spot => spot.id));
});
test("metadata edits and deleted spots are rejected", () => {
  for (const key of ["id", "lat", "lon", "category", "color"]) {
    const edited = structuredClone(spots);
    edited[0][key] = { id: "spot-999", lat: 35, lon: 140, category: "food", color: "#ffffff" }[key];
    assert.throws(() => data.mergeEditable(spots, edited));
  }
  assert.throws(() => data.mergeEditable(spots, spots.slice(1)));
});
test("invalid names and unsafe URLs cannot be saved", () => {
  assert.notEqual(data.fieldError("name", "  "), "");
  assert.notEqual(data.fieldError("name", "x".repeat(101)), "");
  for (const url of ["javascript:alert(1)", "data:text/html,test", "https://user:pass@example.com/", "//example.com/image.png"]) {
    assert.notEqual(data.fieldError("photo", url), "");
    assert.equal(data.safeUrl(url), "");
  }
  assert.equal(data.fieldError("photo", "assets/image.png"), "");
  assert.equal(data.fieldError("homepage", "https://example.com/"), "");
  assert.notEqual(data.fieldError("youtube2", "https://youtube.com.evil.example/watch?v=abcdefghijk"), "");
});
test("YouTube links only embed actual YouTube videos", () => {
  assert.equal(data.youtubeEmbed("https://youtu.be/abcdefghijk?t=4"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(data.youtubeEmbed("https://youtube.com/shorts/abcdefghijk"), "https://www.youtube.com/embed/abcdefghijk");
  assert.equal(data.youtubeEmbed("https://notyoutube.com/watch?v=abcdefghijk"), "");
});
test("card preview escapes text and disables actions without changing live map actions", () => {
  const spot = { ...spots[0], name: '<img src=x onerror="alert(1)">', desc: "<script>alert(1)</script>", photo: "javascript:alert(1)", homepage: "javascript:alert(1)", youtube: "", youtube2: "" };
  const preview = context.buildPopupHtml(spot, { preview: true });
  assert.ok(preview.includes("&lt;script&gt;"));
  assert.ok(!preview.includes("<script>"));
  assert.ok(!preview.includes("javascript:"));
  assert.ok(!preview.includes("onclick="));
  assert.equal((preview.match(/disabled/g) || []).length, 2);
  assert.ok(context.buildPopupHtml(spot).includes(`openGoogleMapsRoute(${spot.lat}, ${spot.lon})`));
});
