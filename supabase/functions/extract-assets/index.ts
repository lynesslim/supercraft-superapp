import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

async function dispatchExtraction(
  apiKey: string,
  baseUrl: string,
  imageBlob: Blob,
  prompt: string,
  size: string,
  assetType: "background" | "sheet",
) {
  const formData = new FormData()
  formData.append("model", "gpt-image-2")
  formData.append("prompt", prompt)
  formData.append("size", size)
  formData.append("image", imageBlob, "mockup-source.png")

  const res = await fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
    body: formData,
  })

  if (!res.ok) {
    const errorText = await res.text()
    let errorMsg = `API error: ${res.status}`
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.error?.message) errorMsg = parsed.error.message
    } catch {
      // ignore parse error
    }
    throw new Error(errorMsg)
  }

  const payload = await res.json() as { data?: Array<{ url?: string; b64_json?: string }> }
  let imageUrl = ""
  if (payload.data?.[0]?.url) {
    imageUrl = payload.data[0].url
  } else if (payload.data?.[0]?.b64_json) {
    const b64 = payload.data[0].b64_json
    imageUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`
  }

  if (!imageUrl) {
    throw new Error("API did not return image data.")
  }

  return { asset_type: assetType, image_url: imageUrl, prompt_used: prompt }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { mockupImageUrl, bgPrompt, iconPrompt } = await req.json()

    if (!mockupImageUrl || !bgPrompt || !iconPrompt) {
      return new Response(JSON.stringify({ error: "mockupImageUrl, bgPrompt, and iconPrompt are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const srcResponse = await fetch(mockupImageUrl)
    if (!srcResponse.ok) {
      throw new Error(`Failed to fetch source mockup image: ${srcResponse.statusText}`)
    }
    const imageBlob = await srcResponse.blob()

    const openaiBaseUrl = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1"
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured")
    }

    const [backgroundResult, iconographyResult] = await Promise.allSettled([
      dispatchExtraction(openaiApiKey, openaiBaseUrl, imageBlob, bgPrompt, "2048x1152", "background"),
      dispatchExtraction(openaiApiKey, openaiBaseUrl, imageBlob, iconPrompt, "1152x2048", "sheet"),
    ])

    const results: Array<{ asset_type: "background" | "sheet"; image_url: string; prompt_used: string }> = []

    if (backgroundResult.status === "fulfilled") {
      results.push(backgroundResult.value)
    }
    if (iconographyResult.status === "fulfilled") {
      results.push(iconographyResult.value)
    }

    if (results.length === 0) {
      const reasons = [backgroundResult, iconographyResult]
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map(r => r.reason?.message || "Unknown error")
      throw new Error(`Both extraction tasks failed: ${reasons.join(" | ")}`)
    }

    return new Response(JSON.stringify({ success: true, assets: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
