const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const source = fs.readFileSync(process.env.GYODA_MAIN || path.join(__dirname, "..", "main.js"), "utf8");
const dataStart = source.indexOf("const CATEGORY =");
const dataEnd = source.indexOf("const map = new maplibregl.Map");
assert.ok(dataStart >= 0 && dataEnd > dataStart);
const spotData = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "spots.json"), "utf8"));
const dataApi = require("../js/spot-data.js");
const dataSource = source.slice(dataStart, dataEnd)
  .replace("async function initializeMap() {", "")
  .replace("await GyodaSpotData.load()", JSON.stringify(spotData))
  .replace("await GyodaPublicationData.load(spots)", "spots");
const routeIds = ["spot-005", "spot-003", "spot-002", "spot-001"];

function loadData(mutation = "") {
  const context = vm.createContext({ window: {}, GyodaSpotData: dataApi, GyodaMapPreview: { read: () => null } });
  vm.runInContext(dataSource.replace("const spotsById =", `${mutation}\nconst spotsById =`), context);
  return context;
}

function read(context, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context));
}

test("all 18 spots have distinct fixed IDs and resolve to their original objects", () => {
  const context = loadData();
  assert.equal(read(context, "spots.length"), 18);
  assert.equal(read(context, "spotsById.size"), 18);
  assert.ok(read(context, "spots.every(spot => requireSpot(spot.id) === spot)"));
  assert.deepEqual(read(context, "featuredRouteSpots.map(spot => spot.id)"), routeIds);
  assert.deepEqual(read(context, "featuredRouteStorySteps.map(step => step.spot.id)"), routeIds);
});

test("renaming every spot and reversing data order preserves route and camera destinations", () => {
  const original = loadData();
  const renamed = loadData('spots.forEach(spot => { spot.name = "Renamed"; }); spots.reverse();');
  assert.deepEqual(read(renamed, "featuredRouteSpots.map(spot => spot.id)"), routeIds);
  assert.deepEqual(read(renamed, "featuredRouteCoordinates"), read(original, "featuredRouteCoordinates"));
  assert.deepEqual(read(renamed, "featuredRouteStorySteps.map(step => [step.spot.id, step.spot.lat, step.spot.lon, step.zoom, step.pitch, step.bearing])"),
    read(original, "featuredRouteStorySteps.map(step => [step.spot.id, step.spot.lat, step.spot.lon, step.zoom, step.pitch, step.bearing])"));
  assert.ok(read(renamed, 'featuredRouteStorySteps.every(step => step.spot.name === "Renamed")'));
  assert.match(source, /titleEl\.textContent = step\.spot\.name/);
});

test("filtered list uses fixed IDs, including after reordering", () => {
  const context = loadData("spots.reverse();");
  const list = { innerHTML: "" };
  const count = { textContent: "" };
  context.document = { getElementById: (id) => id === "visible-spot-list" ? list : count };
  const start = source.indexOf("function renderVisibleSpotList()");
  const end = source.indexOf("\n  renderVisibleSpotList();", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext('const activeCategories = new Set(["station"]);', context);
  vm.runInContext(source.slice(start, end) + "\nrenderVisibleSpotList();", context);
  const ids = Array.from(list.innerHTML.matchAll(/data-spot-id="([^"]+)"/g), match => match[1]);
  assert.deepEqual(ids, ["spot-005", "spot-004"]);
  assert.match(source, /spotsById\.get\(listButton\.dataset\.spotId\)/);
  vm.runInContext("activeCategories.clear(); renderVisibleSpotList();", context);
  assert.equal(Array.from(list.innerHTML.matchAll(/data-spot-id=/g)).length, 0);
});

test("duplicate IDs fail explicitly", () => {
  assert.throws(() => loadData("spots[1].id = spots[0].id;"), /duplicate spot ID/);
});

test("missing IDs fail explicitly", () => {
  assert.throws(() => loadData("delete spots[0].id;"), /Missing, invalid/);
});

test("missing route destinations fail instead of silently shortening the route", () => {
  assert.throws(() => loadData('spots.splice(spots.findIndex(spot => spot.id === "spot-005"), 1);'), /Unknown spot ID/);
});
