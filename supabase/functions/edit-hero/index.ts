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
    const { imageUrl, instruction } = await req.json()

    if (!imageUrl || !instruction) {
      return new Response(JSON.stringify({ error: "imageUrl and instruction are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const prompt = `Edit the attached hero mockup image. ${instruction}. Preserve the overall layout and branding. Return the revised mockup.`

    const formData = new FormData()
    formData.append("model", "gpt-image-2")
    formData.append("size", "1152x2048")
    formData.append("prompt", prompt)

    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch source image: ${imageRes.statusText}`)
    }
    const imageBlob = await imageRes.blob()
    formData.append("image", imageBlob, "mockup-source.png")

    const openaiBaseUrl = Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1"
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not configured")
    }

    const response = await fetch(`${openaiBaseUrl}/images/edits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMsg = `API error: ${response.status}`
      try {
        const parsed = JSON.parse(errorText)
        if (parsed.error?.message) errorMsg = parsed.error.message
      } catch {
        // ignore parse error
      }
      throw new Error(errorMsg)
    }

    const payload = await response.json() as { data?: Array<{ url?: string; b64_json?: string }> }
    let finalImageUrl = ""
    if (payload.data?.[0]?.url) {
      finalImageUrl = payload.data[0].url
    } else if (payload.data?.[0]?.b64_json) {
      const b64 = payload.data[0].b64_json
      finalImageUrl = b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`
    }

    if (!finalImageUrl) {
      throw new Error("API did not return any image data in the edit response.")
    }

    return new Response(JSON.stringify({ url: finalImageUrl, prompt }), {
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
