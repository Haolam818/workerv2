function json(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function textFromVision(result) {
  return (
    result?.responses?.[0]?.fullTextAnnotation?.text ||
    result?.responses?.[0]?.textAnnotations?.[0]?.description ||
    ""
  );
}

function normalizeDate(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).trim().match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return String(dateStr).trim();
  return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
}

function extractFields(rawText) {
  const text = (rawText || "").replace(/\r\n/g, "\n");

  // Safety card no patterns seen in this repo: HC-4821-8830, SK-4839-2201, etc.
  const noMatch =
    text.match(/\b([A-Z]{1,3}[-\s]?\d{3,5}[-\s]?\d{2,6})\b/) ||
    text.match(/\b(\d{4}[-\s]?\d{4}[-\s]?\d{2,6})\b/);

  // Expiry date: try label-based then generic.
  const expiryMatch =
    text.match(/(?:到期|有效期|Expiry|EXPIRY|Valid\s*to)[^0-9]*?(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/i) ||
    text.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/);

  // Name: try label-based, then heuristics (2-4 Chinese chars).
  const nameMatch =
    text.match(/(?:姓名|Name)\s*[:：]?\s*([^\n]{2,20})/i) ||
    text.match(/[\u4e00-\u9fff]{2,4}/);

  return {
    name: nameMatch ? String(nameMatch[1] || nameMatch[0]).trim() : "",
    safety_card_no: noMatch ? String(noMatch[1] || noMatch[0]).trim() : "",
    expiry_date: normalizeDate(expiryMatch ? (expiryMatch[1] || expiryMatch[0]) : "")
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return json({ ok: true }, { status: 200 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/ocr") {
      return json({ error: { message: "Not found" } }, { status: 404 });
    }

    if (request.method !== "POST") {
      return json({ error: { message: "Method not allowed" } }, { status: 405 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: { message: "Invalid JSON body" } }, { status: 400 });
    }

    const imageBase64 = payload?.image_base64 || payload?.imageBase64 || "";
    const mimeType = payload?.mime_type || payload?.mimeType || "image/jpeg";

    if (!imageBase64) {
      return json({ error: { message: "Missing image_base64" } }, { status: 400 });
    }

    const apiKey = env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return json({ error: { message: "Server missing GOOGLE_VISION_API_KEY" } }, { status: 500 });
    }

    const visionReq = {
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "TEXT_DETECTION" }],
          imageContext: {
            languageHints: ["zh-Hant", "zh-Hans", "en"]
          }
        }
      ]
    };

    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
    let visionJson;
    try {
      const resp = await fetch(visionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(visionReq)
      });
      visionJson = await resp.json();
      if (!resp.ok) {
        return json({ error: { message: "Vision API error", details: visionJson } }, { status: 502 });
      }
    } catch (e) {
      return json({ error: { message: "Failed to call Vision API" } }, { status: 502 });
    }

    const rawText = textFromVision(visionJson);
    const fields = extractFields(rawText);

    return json({
      ok: true,
      fields,
      raw_text: rawText,
      meta: { mime_type: mimeType }
    });
  }
};

