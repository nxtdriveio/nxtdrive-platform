const INTAKE_WIDGET_SCRIPT = `(function () {
  var script = document.currentScript;
  if (!script) {
    var scripts = document.getElementsByTagName("script");
    script = scripts[scripts.length - 1];
  }
  if (!script || script.getAttribute("data-nxtdrive-intake-mounted") === "true") {
    return;
  }
  script.setAttribute("data-nxtdrive-intake-mounted", "true");

  var tenant = (script.getAttribute("data-tenant") || "").trim();
  if (!tenant) {
    if (window.console && console.warn) {
      console.warn("[NXTDRIVE] Intake widget mist data-tenant.");
    }
    return;
  }

  var appOrigin = "https://app.nxtdrive.nl";
  try {
    appOrigin = new URL(script.src, window.location.href).origin;
  } catch (error) {}

  function clean(value, max) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max || 240);
  }

  function add(params, key, value, max) {
    var next = clean(value, max);
    if (next) params.set(key, next);
  }

  var params = new URLSearchParams();
  var query = new URLSearchParams(window.location.search || "");
  params.set("embed", "script");

  var fields = [
    ["source", "source"],
    ["campaign", "campaign"],
    ["utm-source", "utm_source"],
    ["utm-medium", "utm_medium"],
    ["utm-campaign", "utm_campaign"],
    ["utm-content", "utm_content"],
    ["utm-term", "utm_term"],
    ["gclid", "gclid"],
    ["fbclid", "fbclid"],
    ["msclkid", "msclkid"],
    ["ref", "ref"]
  ];

  for (var i = 0; i < fields.length; i += 1) {
    var attr = fields[i][0];
    var param = fields[i][1];
    add(
      params,
      param,
      script.getAttribute("data-" + attr) || query.get(param) || query.get(attr),
      500
    );
  }

  add(params, "embed_host", window.location.host, 240);
  add(params, "landing_url", window.location.href, 1000);
  add(params, "referrer", document.referrer, 1000);

  var maxWidth = clean(script.getAttribute("data-max-width"), 20) || "760px";
  var margin = clean(script.getAttribute("data-margin"), 60) || "0 auto";
  var height = clean(script.getAttribute("data-height"), 8) || "820";
  var radius = clean(script.getAttribute("data-radius"), 8) || "28";

  var wrapper = document.createElement("div");
  wrapper.setAttribute("data-nxtdrive-intake", tenant);
  wrapper.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "max-width:" + maxWidth,
    "margin:" + margin,
    "font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
  ].join(";");

  var iframe = document.createElement("iframe");
  iframe.title = script.getAttribute("data-title") || "NXTDRIVE intake";
  iframe.src =
    appOrigin +
    "/widget/intake/" +
    encodeURIComponent(tenant) +
    "?" +
    params.toString();
  iframe.loading = "lazy";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText = [
    "display:block",
    "width:100%",
    "min-height:" + height + "px",
    "height:" + height + "px",
    "border:0",
    "border-radius:" + radius + "px",
    "overflow:hidden",
    "background:transparent"
  ].join(";");

  wrapper.appendChild(iframe);
  script.parentNode.insertBefore(wrapper, script.nextSibling);

  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin) return;
    var data = event.data || {};
    if (
      data.type !== "nxtdrive:intake:resize" ||
      data.tenant !== tenant ||
      !Number.isFinite(Number(data.height))
    ) {
      return;
    }
    var height = Math.max(560, Math.min(1600, Math.ceil(Number(data.height))));
    iframe.style.height = height + "px";
  });
})();`;

export function GET() {
  return new Response(INTAKE_WIDGET_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
