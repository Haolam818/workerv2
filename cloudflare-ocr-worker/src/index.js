function json(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function extractTextFromArkResponse(payload) {
  if (!payload) return "";
  if (typeof payload.output_text === "string") return payload.output_text;

  // Compatible with "Responses" style payloads.
  const out = payload.output;
  if (Array.isArray(out)) {
    let acc = "";
    for (const item of out) {
      const content = item && item.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part) continue;
        if (typeof part.text === "string") acc += part.text;
        if (typeof part.output_text === "string") acc += part.output_text;
      }
    }
    return acc;
  }

  return "";
}

function normalizeDate(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).trim().match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return String(dateStr).trim();
  return `${m[1]}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
}

function extractJsonFromText(text) {
  const raw = String(text || "");
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const candidate = (codeBlockMatch && codeBlockMatch[1] ? codeBlockMatch[1].trim() : "") || (jsonMatch ? jsonMatch[0] : "");
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch (e) {
    return null;
  }
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

    const apiKey = env.ARK_API_KEY;
    if (!apiKey) {
      return json({ error: { message: "Server missing ARK_API_KEY" } }, { status: 500 });
    }

    const model = env.ARK_MODEL || "doubao-seed-1-6-flash-250828";
    const endpoint = env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3/responses";

    const dataUrl = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
    const prompt =
      "请识别这张图片（平安咭/建造业工人相关证件）并提取以下字段，" +
      "只返回严格 JSON，不要多余文字：\n" +
      "1) name（持证人姓名）\n" +
      "2) safety_card_no（平安咭编号，如 HC-XXXX-XXXX / SK-XXXX-XXXX）\n" +
      "3) expiry_date（平安咭过期日，格式 YYYY/MM/DD）\n";

    const arkReq = {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: dataUrl },
            { type: "input_text", text: prompt }
          ]
        }
      ]
    };

    let arkJson;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(arkReq)
      });
      arkJson = await resp.json();
      if (!resp.ok) {
        return json({ error: { message: "ARK API error", details: arkJson } }, { status: 502 });
      }
    } catch (e) {
      return json({ error: { message: "Failed to call ARK API" } }, { status: 502 });
    }

    const rawText = extractTextFromArkResponse(arkJson);
    const parsed = extractJsonFromText(rawText);
    const fieldsFromModel = parsed && typeof parsed === "object" ? {
      name: String(parsed.name || "").trim(),
      safety_card_no: String(parsed.safety_card_no || parsed.safetyNo || "").trim(),
      expiry_date: normalizeDate(parsed.expiry_date || parsed.expiryDate || parsed.expiry || "")
    } : null;

    const fields = fieldsFromModel || extractFields(rawText);

    return json({
      ok: true,
      fields,
      raw_text: rawText,
      meta: { mime_type: mimeType }
    });
  }
};
