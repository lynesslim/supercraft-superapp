import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const rawBody = await req.text()
    console.log(`[generate-hero] Received request. Body length: ${rawBody.length}`)
    const { prompt, imageUrl, logoUrl, size = "1152x2048" } = JSON.parse(rawBody)
    
    console.log(`[generate-hero] Parsed input. Size: ${size}, HasImage: ${!!imageUrl}, HasLogo: ${!!logoUrl}`)

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const formData = new FormData()
    formData.append("model", "gpt-image-2")
    formData.append("prompt", prompt)
    formData.append("size", size)

    if (imageUrl) {
      console.log(`[generate-hero] Fetching reference image: ${imageUrl}`)
      const imageRes = await fetch(imageUrl)
      if (!imageRes.ok) {
        console.error(`[generate-hero] Failed to fetch reference image. Status: ${imageRes.status}`)
        throw new Error(`Failed to fetch reference image: ${imageRes.statusText}`)
      }
      const imageBlob = await imageRes.blob()
      console.log(`[generate-hero] Reference image fetched. Size: ${imageBlob.size} bytes`)
      formData.append("image", imageBlob, "reference-layout.png")
    }

    if (logoUrl) {
      const logoRes = await fetch(logoUrl)
      if (!logoRes.ok) {
        throw new Error(`Failed to fetch logo image: ${logoRes.statusText}`)
      }
      const logoBlob = await logoRes.blob()
      formData.append("image", logoBlob, "logo.png")
    }

    const openaiBaseUrl = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1"
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured")
    }

    console.log(`[generate-hero] Dispatching request to proxy: ${openaiBaseUrl}/images/edits`)
    const response = await fetch(`${openaiBaseUrl}/images/edits`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      body: formData,
    })

    console.log(`[generate-hero] Proxy responded with status: ${response.status}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[generate-hero] Proxy error body: ${errorText}`)
      let errorMsg = `API error: ${response.status}`
      try {
        const parsed = JSON.parse(errorText)
        if (parsed.error?.message) errorMsg = parsed.error.message
      } catch (e) {}
      throw new Error(errorMsg)
    }

    const payload = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> }
    console.log(`[generate-hero] Proxy payload successfully parsed. Has data: ${!!payload.data}`)
    let generatedUrl = ""
    if (payload.data?.[0]?.url) {
      generatedUrl = payload.data[0].url
    } else if (payload.data?.[0]?.b64_json) {
      const b64 = payload.data[0].b64_json
      generatedUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`
    }

    if (!generatedUrl) {
      throw new Error("Proxy did not return any image data in the edits payload.")
    }

    const [widthStr, heightStr] = size.split("x")
    const width = parseInt(widthStr, 10)
    const height = parseInt(heightStr, 10)

    return new Response(JSON.stringify({
      url: generatedUrl,
      width,
      height,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[generate-hero] FATAL ERROR: ${message}`)
    if (error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
