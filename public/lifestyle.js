const $ = (id) => document.getElementById(id);
const scene = $("scene");
const storageKey = "morning-desk-warp-config-v1";
const screenScaleStorageKey = "morning-desk-screen-scale-v1";
const defaultScreenScale = 1.28;
const companionPort = new URLSearchParams(window.location.search).get("port") || window.DASHBOARD_CONFIG?.companionPort || 43761;
// Wallpaper Engine loads this page from disk (file://) or from its own origin, so
// "same origin" is only true when the companion server itself served the page.
const loopbackHosts = ["127.0.0.1", "localhost", "::1", "[::1]"];
const servedByCompanion =
  /^https?:$/.test(window.location.protocol) &&
  String(window.location.port) === String(companionPort) &&
  loopbackHosts.includes(window.location.hostname);
const companionOrigin = servedByCompanion ? "" : `http://127.0.0.1:${companionPort}`;

// Wallpaper Engine's file:// origin may deny Web Storage; calibration should
// still work, it just will not survive a restart in that case.
function readStorage(key) {
  try { return window.localStorage.getItem(key); }
  catch { return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); }
  catch { /* ignore */ }
}

function removeStorage(key) {
  try { window.localStorage.removeItem(key); }
  catch { /* ignore */ }
}
const labels = { clock: "闹钟", calendar: "台历", cpu: "CPU 便签", gpu: "GPU 便签", memory: "内存便签", screen: "天气与网速屏" };
const defaults = {
  clock: { size: [432, 176], points: [[12.459347181008903, 57.62991092358182], [34.67195845697329, 56.247632442569156], [34.90608308605341, 74.99573370839194], [12.784124629080118, 76.96092358180965]] },
  calendar: { size: [330, 234], points: [[38.675222551928776, 45.87194092827004], [56.762166172106824, 44.839029535864974], [58.15237388724035, 71.30232067510549], [39.865430267062315, 73.64556962025317]] },
  cpu: { size: [188, 67], points: [[49.12715133531157, 76.46286919831223], [57.660652818991096, 77.77932489451476], [55.43219584569733, 83.5702953586498], [46.067833827893175, 82.36481012658227]] },
  gpu: { size: [188, 67], points: [[59.120207715133525, 77.85675105485232], [68.13783382789317, 78.7012658227848], [66.71023738872404, 84.97966244725738], [56.98044510385757, 83.59772151898734]] },
  memory: { size: [188, 67], points: [[69.75, 78.77869198312236], [79.10370919881305, 79.78417721518987], [78.43827893175073, 86.19805907172996], [68.14436201780416, 85.15257383966245]] },
  screen: { size: [224, 147], points: [[71.57195845697329, 63.44451476793249], [83.62673590504451, 64.22548523206751], [83.17804154302671, 75.69029535864979], [71.00456973293768, 74.1409282700422]] }
};
let config = loadConfig();
let editing = false;
let activeTarget = "clock";
let dragState = null;

function applyScreenScale(value) {
  const scale = Number(value) || defaultScreenScale;
  document.documentElement.style.setProperty("--network-scale", scale);
  $("screen-scale").value = scale;
  $("screen-scale-value").textContent = `${Math.round(scale * 100)}%`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadConfig() {
  try {
    const saved = JSON.parse(readStorage(storageKey));
    return { ...clone(defaults), ...saved };
  } catch {
    return clone(defaults);
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  $("life-hour").textContent = pad(now.getHours());
  $("life-minute").textContent = pad(now.getMinutes());
  $("life-seconds").textContent = pad(now.getSeconds());
  $("life-weekday").textContent = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
  $("life-day").textContent = pad(now.getDate());
  $("life-month").textContent = `${now.getFullYear()}年 ${now.getMonth() + 1}月`;
  $("life-lunar").textContent = `农历 ${formatLunarDate(now)}`;
}

function formatLunarDate(date) {
  const parts = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", { month: "long", day: "numeric" }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const dayNames = ["", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十", "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];
  return `${month}${dayNames[day] || ""}`;
}

function formatSpeed(bytesPerSecond) {
  const value = Number(bytesPerSecond || 0);
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB/s`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${Math.round(value)} B/s`;
}

function temperature(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°` : "--°";
}

function compactTemperature(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Math.round(Number(value)) : "N/A";
}

function weatherDescription(code) {
  if (code === 0) return ["☀", "晴"];
  if ([1, 2].includes(code)) return ["◐", "少云"];
  if (code === 3) return ["☁", "阴"];
  if ([45, 48].includes(code)) return ["≋", "雾"];
  if (code >= 51 && code <= 67) return ["☂", "雨"];
  if (code >= 71 && code <= 77) return ["❄", "雪"];
  if (code >= 80 && code <= 82) return ["☂", "阵雨"];
  if (code >= 95) return ["ϟ", "雷雨"];
  return ["○", "天气"];
}

function renderMetrics(data) {
  $("life-cpu").textContent = Math.round(data.cpu.usage);
  $("life-cpu-temp").textContent = compactTemperature(data.cpu.temperature);
  $("life-cpu-temp").classList.toggle("unavailable", data.cpu.temperature === null || data.cpu.temperature === undefined);
  $("life-gpu").textContent = data.gpu.available ? Math.round(data.gpu.usage) : "--";
  $("life-gpu-temp").textContent = compactTemperature(data.gpu.temperature);
  $("life-gpu-temp").classList.toggle("unavailable", data.gpu.temperature === null || data.gpu.temperature === undefined);
  $("life-memory").textContent = `${Math.round(data.memory.usage)}%`;
  $("life-memory-bar").style.width = `${Math.round(data.memory.usage)}%`;
  $("life-download").textContent = formatSpeed(data.network.downloadBps);
  $("life-upload").textContent = formatSpeed(data.network.uploadBps);
}

function renderWeather(data) {
  if (data.status === "warming-up") {
    $("life-weather-text").textContent = "IP 定位中";
    scheduleWeatherRetry();
    return;
  }
  if (!Number.isFinite(Number(data.temperature))) {
    scheduleWeatherRetry();
    return;
  }
  const [icon, description] = weatherDescription(Number(data.weatherCode));
  $("life-weather-icon").textContent = icon;
  $("life-weather-temp").textContent = temperature(data.temperature);
  $("life-weather-text").textContent = `${data.location || "当前位置"} · ${description}`;
  if (data.geo?.ip) $("life-weather-text").title = `${data.geo.ip} · ${data.geo.isp || ""}`.trim();
}

let weatherRetryTimer = null;

function scheduleWeatherRetry(delay = 10000) {
  if (weatherRetryTimer) return;
  weatherRetryTimer = setTimeout(() => {
    weatherRetryTimer = null;
    refreshWeather();
  }, delay);
}

function connect() {
  const stream = new EventSource(`${companionOrigin}/api/stream`);
  stream.onmessage = (event) => renderMetrics(JSON.parse(event.data));
  stream.onerror = () => {
    $("life-download").textContent = "--";
    $("life-upload").textContent = "--";
  };
}

async function refreshMetrics() {
  try {
    renderMetrics(await fetch(`${companionOrigin}/api/metrics`, { cache: "no-store" }).then((response) => response.json()));
  } catch {
    // SSE will continue retrying in the background.
  }
}

async function refreshWeather() {
  try {
    renderWeather(await fetch(`${companionOrigin}/api/weather`, { cache: "no-store" }).then((response) => response.json()));
  } catch {
    $("life-weather-text").textContent = "天气暂不可用";
    scheduleWeatherRetry();
  }
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    [vector[column], vector[pivot]] = [vector[pivot], vector[column]];
    const divisor = matrix[column][column];
    for (let index = column; index < n; index++) matrix[column][index] /= divisor;
    vector[column] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = matrix[row][column];
      for (let index = column; index < n; index++) matrix[row][index] -= factor * matrix[column][index];
      vector[row] -= factor * vector[column];
    }
  }
  return vector;
}

function matrix3d(size, points) {
  const [width, height] = size;
  const source = [[0, 0], [width, 0], [width, height], [0, height]];
  const equations = [];
  const values = [];
  source.forEach(([x, y], index) => {
    const [targetX, targetY] = points[index];
    equations.push([x, y, 1, 0, 0, 0, -x * targetX, -y * targetX]);
    values.push(targetX);
    equations.push([0, 0, 0, x, y, 1, -x * targetY, -y * targetY]);
    values.push(targetY);
  });
  const [a, b, c, d, e, f, g, h] = solveLinear(equations, values);
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

function percentToPixels(points) {
  return points.map(([x, y]) => [x * scene.clientWidth / 100, y * scene.clientHeight / 100]);
}

function renderWarps() {
  document.querySelectorAll(".warp").forEach((element) => {
    const item = config[element.dataset.warp];
    element.style.width = `${item.size[0]}px`;
    element.style.height = `${item.size[1]}px`;
    element.style.transform = matrix3d(item.size, percentToPixels(item.points));
  });
  renderCalibration();
}

function renderCalibration() {
  const overlay = $("calibration-overlay");
  overlay.innerHTML = "";
  if (!editing) return;
  const points = percentToPixels(config[activeTarget].points);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("calibration-polygon");
  svg.setAttribute("width", scene.clientWidth);
  svg.setAttribute("height", scene.clientHeight);
  svg.style.inset = "0";
  const polygon = document.createElementNS(ns, "polygon");
  polygon.setAttribute("points", points.map((point) => point.join(",")).join(" "));
  svg.appendChild(polygon);
  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", points[0][0] + 10);
  text.setAttribute("y", points[0][1] - 10);
  text.textContent = labels[activeTarget];
  svg.appendChild(text);
  overlay.appendChild(svg);

  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));
  const maxY = Math.max(...points.map(([, y]) => y));
  const dragArea = document.createElement("div");
  dragArea.className = "calibration-drag-area";
  dragArea.style.cssText = `left:${minX}px;top:${minY}px;width:${maxX - minX}px;height:${maxY - minY}px`;
  dragArea.addEventListener("pointerdown", (event) => startDrag(event, "area"));
  overlay.appendChild(dragArea);

  points.forEach(([x, y], index) => {
    const handle = document.createElement("i");
    handle.className = "calibration-handle";
    handle.style.cssText = `left:${x}px;top:${y}px`;
    handle.addEventListener("pointerdown", (event) => startDrag(event, index));
    overlay.appendChild(handle);
  });
}

function startDrag(event, point) {
  event.preventDefault();
  event.stopPropagation();
  dragState = { point, x: event.clientX, y: event.clientY, initial: clone(config[activeTarget].points) };
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", stopDrag, { once: true });
}

function moveDrag(event) {
  if (!dragState) return;
  const dx = (event.clientX - dragState.x) / scene.clientWidth * 100;
  const dy = (event.clientY - dragState.y) / scene.clientHeight * 100;
  if (dragState.point === "area") {
    config[activeTarget].points = dragState.initial.map(([x, y]) => [x + dx, y + dy]);
  } else {
    config[activeTarget].points[dragState.point] = [dragState.initial[dragState.point][0] + dx, dragState.initial[dragState.point][1] + dy];
  }
  renderWarps();
}

function stopDrag() {
  dragState = null;
  window.removeEventListener("pointermove", moveDrag);
}

function setEditing(value) {
  editing = value;
  scene.classList.toggle("calibration-active", editing);
  $("calibration-panel").setAttribute("aria-hidden", String(!editing));
  $("calibration-overlay").setAttribute("aria-hidden", String(!editing));
  renderCalibration();
}

function setupCalibration() {
  const select = $("calibration-target");
  const screenScale = $("screen-scale");
  select.innerHTML = Object.entries(labels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  select.addEventListener("change", () => {
    activeTarget = select.value;
    renderCalibration();
  });
  $("calibrate-toggle").addEventListener("click", () => setEditing(!editing));
  $("calibration-close").addEventListener("click", () => setEditing(false));
  $("calibration-save").addEventListener("click", () => writeStorage(storageKey, JSON.stringify(config)));
  screenScale.addEventListener("input", () => {
    applyScreenScale(screenScale.value);
    writeStorage(screenScaleStorageKey, screenScale.value);
  });
  $("calibration-reset").addEventListener("click", () => {
    config[activeTarget] = clone(defaults[activeTarget]);
    renderWarps();
  });
  $("calibration-reset-all").addEventListener("click", () => {
    config = clone(defaults);
    removeStorage(screenScaleStorageKey);
    applyScreenScale(defaultScreenScale);
    renderWarps();
  });
}

updateClock();
setupCalibration();
applyScreenScale(readStorage(screenScaleStorageKey) || defaultScreenScale);
renderWarps();
refreshMetrics();
connect();
refreshWeather();
setInterval(updateClock, 1000);
setInterval(refreshWeather, 15 * 60 * 1000);
window.addEventListener("resize", renderWarps);
