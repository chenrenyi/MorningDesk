const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const { collectMetrics } = require("./collector");

const PORT = Number(process.env.PORT || 43761);
const HOST = process.env.HOST || "127.0.0.1";
const publicDir = process.env.PUBLIC_DIR || path.resolve(__dirname, "../public");
const clients = new Set();
let latestMetrics = null;
let latestWeather = null;
let latestIpLocation = null;
let latestIpLocationAt = 0;
let weatherRetryTimer = null;
const ipLocationMaxAge = 6 * 60 * 60 * 1000;
const fallbackLocation = {
  source: "fallback",
  location: "杭州余杭",
  latitude: 30.421,
  longitude: 120.299,
  timezone: "Asia/Shanghai"
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function sendJson(response, data, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(JSON.stringify(data));
}

function fetchJson(url, timeout = 6000) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout, headers: { "User-Agent": "ambient-dashboard/1.0" } }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${url} ${response.statusCode}`));
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("timeout", function onTimeout() {
        this.destroy(new Error("Weather API timeout"));
      })
      .on("error", reject);
  });
}

function trimPlaceSuffix(value, suffixes) {
  let text = String(value || "").trim();
  for (const suffix of suffixes) {
    if (text.endsWith(suffix) && text.length > suffix.length) text = text.slice(0, -suffix.length);
  }
  return text.trim();
}

// IP databases only resolve to city level, so show the shortest useful name
// ("杭州") instead of "杭州 · 浙江省 · 中国". District is used only when the
// provider happens to return one.
function shortLocation(source) {
  const city = trimPlaceSuffix(source.city, ["市", "地区", "盟"]);
  const district = trimPlaceSuffix(source.district, ["区", "县", "市"]);
  if (city && district && !city.includes(district)) return `${city}${district}`;
  if (city) return city;
  const region = trimPlaceSuffix(source.region, ["特别行政区", "自治区", "省", "市"]);
  return region || source.country || source.ip || fallbackLocation.location;
}

async function fetchIpLocation() {
  if (latestIpLocation && Date.now() - latestIpLocationAt < ipLocationMaxAge) return latestIpLocation;

  const payload = await fetchJson("https://ipwho.is/?lang=zh-CN", 5000);
  if (payload.success === false) throw new Error(payload.message || "IP geolocation failed");
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("IP geolocation returned invalid coordinates");

  latestIpLocation = {
    source: "ipwho.is",
    ip: payload.ip,
    city: payload.city,
    region: payload.region,
    country: payload.country,
    latitude,
    longitude,
    timezone: payload.timezone?.id || payload.timezone || "auto",
    isp: payload.connection?.isp || payload.connection?.org,
    district: payload.district || "",
    location: shortLocation({
      city: payload.city,
      district: payload.district,
      region: payload.region,
      country: payload.country,
      ip: payload.ip
    })
  };
  latestIpLocationAt = Date.now();
  return latestIpLocation;
}

async function resolveWeatherLocation() {
  try {
    return await fetchIpLocation();
  } catch (error) {
    console.error("IP location refresh failed:", error.message);
    return latestIpLocation || fallbackLocation;
  }
}

async function fetchWeather() {
  const location = await resolveWeatherLocation();
  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", location.latitude);
  weatherUrl.searchParams.set("longitude", location.longitude);
  weatherUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code");
  weatherUrl.searchParams.set("timezone", location.timezone || "auto");
  const payload = await fetchJson(weatherUrl.toString(), 6000);
  return {
    location: location.location,
    geo: {
      source: location.source,
      ip: location.ip,
      city: location.city,
      region: location.region,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone,
      isp: location.isp
    },
    temperature: payload.current.temperature_2m,
    apparentTemperature: payload.current.apparent_temperature,
    weatherCode: payload.current.weather_code,
    updatedAt: payload.current.time
  };
}

function scheduleWeatherRetry() {
  if (weatherRetryTimer) return;
  weatherRetryTimer = setTimeout(async () => {
    weatherRetryTimer = null;
    await refreshWeather();
  }, 60 * 1000);
}

async function refreshWeather() {
  try {
    latestWeather = await fetchWeather();
  } catch (error) {
    console.error("Weather refresh failed:", error.message);
    // Network may not be ready right after logon; retry sooner than the
    // regular 15 minute interval instead of showing a stale placeholder.
    scheduleWeatherRetry();
  }
}

function serveFile(requestPath, response) {
  const decodedPath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);
  const filePath = path.resolve(publicDir, `.${decodedPath}`);
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": filePath.endsWith("config.js") ? "no-store" : "public, max-age=3600"
    });
    response.end(content);
  });
}

function streamMetrics(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  response.write("retry: 3000\n\n");
  if (latestMetrics) response.write(`data: ${JSON.stringify(latestMetrics)}\n\n`);
  clients.add(response);
  request.on("close", () => clients.delete(response));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/api/metrics") return sendJson(response, latestMetrics || { status: "warming-up" });
  if (url.pathname === "/api/weather") return sendJson(response, latestWeather || { status: "warming-up" });
  if (url.pathname === "/api/stream") return streamMetrics(request, response);
  if (url.pathname === "/api/health") return sendJson(response, { ok: true, clients: clients.size });
  return serveFile(url.pathname, response);
});

async function broadcast() {
  try {
    latestMetrics = await collectMetrics();
    const payload = `data: ${JSON.stringify(latestMetrics)}\n\n`;
    for (const client of clients) client.write(payload);
  } catch (error) {
    console.error("Metric collection failed:", error.message);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`Ambient dashboard running at http://localhost:${PORT}`);
});

broadcast();
refreshWeather();
setInterval(broadcast, 2000);
setInterval(refreshWeather, 15 * 60 * 1000);
