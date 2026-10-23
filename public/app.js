const config = window.DASHBOARD_CONFIG || {};
const $ = (id) => document.getElementById(id);
const locale = config.language || "zh-CN";
const companionPort = new URLSearchParams(window.location.search).get("port") || config.companionPort || 43761;
const companionOrigin = window.location.protocol === "file:" ? `http://127.0.0.1:${companionPort}` : "";

document.documentElement.style.setProperty("--accent", config.accentColor || "#63e5ff");
document.documentElement.style.setProperty("--wallpaper", `url("${config.backgroundImage || "./assets/dashboard-bg.png"}")`);
document.querySelector(".background").style.opacity = String(1 - Number(config.backgroundDim || 0));
$("dashboard-title").textContent = config.title || "SYSTEM OVERVIEW";
$("dashboard-subtitle").textContent = config.subtitle || "AMBIENT HARDWARE MONITOR";

function pad(value) {
  return String(value).padStart(2, "0");
}

function setText(id, text) {
  $(id).textContent = text;
}

function formatBytes(bytes, digits = 1) {
  return `${(Number(bytes || 0) / 1024 ** 3).toFixed(digits)} GB`;
}

function updateClock() {
  const now = new Date();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = config.showSeconds === false ? "" : `<span>:${pad(now.getSeconds())}</span>`;
  $("time").innerHTML = `${hours}:${minutes}${seconds}`;
  setText("date", new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now));
  setText("greeting", now.getHours() < 12 ? "GOOD MORNING" : now.getHours() < 18 ? "GOOD AFTERNOON" : "GOOD EVENING");
}

function isoWeek(date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const start = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(((value - start) / 86400000 + 1) / 7);
}

function renderCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const start = new Date(year, month, 1);
  const mondayOffset = config.weekStartsOn === 0 ? start.getDay() : (start.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);
  const weekdays = config.weekStartsOn === 0 ? ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] : ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  setText("calendar-month", `${year} / ${pad(month + 1)}`);
  setText("week-number", `WEEK ${pad(isoWeek(today))}`);
  $("weekdays").innerHTML = weekdays.map((day) => `<span>${day}</span>`).join("");
  $("calendar-days").innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const faded = date.getMonth() !== month ? " faded" : "";
    const isToday = date.toDateString() === today.toDateString() ? " today" : "";
    return `<span class="${faded}${isToday}">${date.getDate()}</span>`;
  }).join("");
}

function setRing(id, value) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  $(id).style.setProperty("--value", safeValue);
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}D ${pad(hours)}H ${pad(minutes)}M`;
}

function renderDisks(disks) {
  $("disk-list").innerHTML = disks?.length ? disks.slice(0, 3).map((disk) => `
    <div class="disk-row">
      <span>${disk.mount}</span>
      <div class="bar"><i style="width:${disk.usedPercent}%"></i></div>
      <b>${disk.usedPercent}%</b>
    </div>
  `).join("") : `<p class="muted">NO LOCAL DISK DATA</p>`;
}

function renderMetrics(data) {
  setText("hostname", data.system.hostname);
  setText("platform", data.system.platform.toUpperCase());
  setText("cpu-usage", `${data.cpu.usage}%`);
  setText("cpu-ring-value", Math.round(data.cpu.usage));
  setRing("cpu-ring", data.cpu.usage);
  setText("cpu-name", data.cpu.name);
  setText("cpu-speed", `${(data.cpu.speedMhz / 1000).toFixed(2)} GHz`);
  setText("cpu-cores", `${data.cpu.cores} THREADS`);

  setText("memory-usage", `${data.memory.usage}%`);
  setText("memory-ring-value", Math.round(data.memory.usage));
  setRing("memory-ring", data.memory.usage);
  setText("memory-used", `${formatBytes(data.memory.used)} USED`);
  setText("memory-total", `${formatBytes(data.memory.total)} TOTAL`);

  if (data.gpu.available) {
    setText("gpu-name", data.gpu.name);
    setText("gpu-details", data.gpu.temperature ? `${data.gpu.temperature}°C · NVIDIA SMI TELEMETRY` : "NVIDIA SMI TELEMETRY");
    setText("gpu-usage", `${data.gpu.usage}%`);
    setText("gpu-memory", `${formatBytes(data.gpu.memoryUsed)} / ${formatBytes(data.gpu.memoryTotal)}`);
    $("gpu-bar").style.width = `${data.gpu.usage}%`;
  } else {
    setText("gpu-name", "GPU TELEMETRY UNAVAILABLE");
    setText("gpu-details", "Install or enable NVIDIA SMI to display GPU metrics");
  }

  renderDisks(data.disks);
  setText("network-name", data.network.name.toUpperCase());
  setText("network-address", data.network.address);
  setText("uptime", formatUptime(data.system.uptime));
  setText("last-update", `UPDATED ${new Date(data.timestamp).toLocaleTimeString(locale, { hour12: false })}`);
  $("connection-dot").classList.add("online");
  setText("connection-text", "LIVE");
}

function connectStream() {
  const stream = new EventSource(`${companionOrigin}/api/stream`);
  stream.onmessage = (event) => renderMetrics(JSON.parse(event.data));
  stream.onerror = () => {
    $("connection-dot").classList.remove("online");
    setText("connection-text", "RECONNECTING");
  };
}

updateClock();
renderCalendar();
connectStream();
setInterval(updateClock, 1000);
setInterval(renderCalendar, 60000);
