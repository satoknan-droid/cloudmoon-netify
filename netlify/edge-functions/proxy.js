export const config = { path: "/*" };

const ORIGIN = "https://web.cloudmoonapp.com";

const AD_PATTERNS = [
  "googlesyndication.com", "doubleclick.net", "googleadservices.com",
  "google-analytics.com", "googletagmanager.com", "googletagservices.com",
  "adservice.google.com", "pagead2.googlesyndication.com",
  "tpc.googlesyndication.com", "video-ad-stats.googlesyndication.com",
  "ads.google.com", "adssettings.google.com", "static.ads-twitter.com",
  "ads-api.twitter.com", "ads.facebook.com", "an.facebook.com",
  "adnxs.com", "advertising.com", "outbrain.com", "taboola.com",
  "criteo.com", "pubmatic.com", "rubiconproject.com", "openx.net",
  "adsafeprotected.com", "moatads.com", "scorecardresearch.com",
  "/ads/", "/ad/", "/advert/", "/advertisement/", "/adsense/",
  "/adserver/", "/analytics/", "prebid", "advertis", "banner", "popup",
];

const isAdRequest = (u) => AD_PATTERNS.some((p) => u.toLowerCase().includes(p));

const DROP_HEADERS = new Set([
  "host", "connection", "keep-alive", "transfer-encoding", "upgrade",
  "te", "trailer", "proxy-authenticate", "proxy-authorization",
  "cf-connecting-ip", "cf-ray", "x-forwarded-proto", "x-real-ip",
]);

function cleanRequestHeaders(request) {
  const headers = new Headers(request.headers);
  for (const h of [...headers.keys()]) {
    if (DROP_HEADERS.has(h.toLowerCase())) headers.delete(h);
  }
  if (!headers.has("user-agent")) {
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
  }
  return headers;
}

async function proxyCloudMoon(request) {
  const url = new URL(request.url);
  let targetURL;

  if (url.pathname.startsWith("/proxy/")) {
    try {
      targetURL = decodeURIComponent(url.pathname.slice("/proxy/".length));
    } catch {
      return new Response("Invalid proxy URL", { status: 400 });
    }
    if (!targetURL.startsWith(ORIGIN)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (url.search) targetURL += url.search;
  } else {
    targetURL = ORIGIN + url.pathname + url.search;
  }

  if (isAdRequest(targetURL)) return new Response("", { status: 204 });

  const init = { method: request.method, headers: cleanRequestHeaders(request), redirect: "follow" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let response;
  try {
    response = await fetch(new Request(targetURL, init));
  } catch {
    return new Response("Failed to fetch resource", { status: 502 });
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.delete("Content-Security-Policy");
  newHeaders.delete("X-Frame-Options");

  const loc = newHeaders.get("Location");
  if (loc) {
    try {
      const l = new URL(loc, targetURL);
      if (l.origin === new URL(ORIGIN).origin) {
        newHeaders.set("Location", "/proxy/" + encodeURIComponent(l.href));
      }
    } catch {}
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function getMainHTML() {
  const appURL = "/proxy/" + encodeURIComponent(ORIGIN + "/");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Home</title>
</head>
<body style="margin:0;overflow:hidden;background:#000">
<iframe src="${appURL}" allow="fullscreen; autoplay; clipboard-read; clipboard-write; gamepad; accelerometer; gyroscope"
  style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>
</body>
</html>`;
}

function getServiceWorker() {
  return `self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {});`;
}

export default async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "") {
    return new Response(getMainHTML(), {
      headers: {
        "Content-Type": "text/html",
        "Permissions-Policy": "accelerometer=*, gyroscope=*, camera=*, microphone=*, geolocation=*, hid=*, midi=*, clipboard-read=*, clipboard-write=*, xr-spatial-tracking=*, gamepad=*",
      },
    });
  }
  if (url.pathname === "/sw.js") {
    return new Response(getServiceWorker(), {
      headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/" },
    });
  }
  return proxyCloudMoon(request);
};
