const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/responses";
const ARK_MODEL = "doubao-seed-1-6-flash-250828";
const PLACEHOLDER_ARK_API_KEY = "ark-96fd4580-272f-4406-b112-0aae21641272-f9546";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const bodyApiKey = req.body && typeof req.body.apiKey === "string" ? req.body.apiKey.trim() : "";
  const headerApiKey = typeof req.headers["x-ark-api-key"] === "string" ? req.headers["x-ark-api-key"].trim() : "";
  const envApiKey = typeof process.env.ARK_API_KEY === "string" ? process.env.ARK_API_KEY.trim() : "";
  const apiKey = bodyApiKey || headerApiKey || envApiKey;

  if (!apiKey || apiKey === PLACEHOLDER_ARK_API_KEY) {
    res.status(400).json({
      error: {
        code: "MissingArkApiKey",
        message: "Missing valid ARK API key. Please set a real key in window.__ARK_API_KEY__ or ARK_API_KEY."
      }
    });
    return;
  }

  try {
    const arkResp = await fetch(ARK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        input: req.body && req.body.input ? req.body.input : []
      })
    });

    const text = await arkResp.text();
    res.status(arkResp.status);
    res.setHeader("Content-Type", arkResp.headers.get("content-type") || "application/json; charset=utf-8");
    res.send(text);
  } catch (error) {
    res.status(502).json({
      error: {
        message: "Failed to call ARK API",
        detail: error && error.message ? error.message : String(error)
      }
    });
  }
}
