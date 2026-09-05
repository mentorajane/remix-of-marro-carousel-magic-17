import { createFileRoute } from "@tanstack/react-router";

const IMAGE_MODEL =
  process.env["GEMINI_IMAGE_MODEL"] ||
  "gemini-2.0-flash-preview-image-generation";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gemini =
          process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "";
        const lovable = process.env["LOVABLE_API_KEY"] || "";

        const { prompt } = (await request.json()) as { prompt: string };
        const styledPrompt = `${prompt}. Editorial magazine cover photography, high contrast, cinematic lighting, brown / black / white color grading, no text, no letters.`;

        // 1) Gemini direto (Vercel + GEMINI_API_KEY)
        if (gemini) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(gemini)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: styledPrompt }] }],
                generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
              }),
            },
          );

          if (!res.ok) {
            return new Response((await res.text()) || "Falha no Gemini", {
              status: res.status,
            });
          }

          const json = (await res.json()) as {
            candidates?: {
              content?: {
                parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
              };
            }[];
          };
          const parts = json.candidates?.[0]?.content?.parts ?? [];
          const img = parts.find((p) => p.inlineData?.data);
          if (!img?.inlineData?.data) {
            return new Response("Sem imagem retornada", { status: 502 });
          }
          return Response.json({
            image: `data:${img.inlineData.mimeType || "image/png"};base64,${img.inlineData.data}`,
          });
        }

        // 2) Fallback Lovable
        if (!lovable) {
          return new Response(
            "Missing GEMINI_API_KEY. Configure GEMINI_API_KEY nas Environment Variables da Vercel.",
            { status: 500 },
          );
        }

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovable}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-image-2",
              prompt: styledPrompt,
              size: "1024x1536",
              quality: "low",
              n: 1,
            }),
          },
        );

        if (!upstream.ok) {
          return new Response(await upstream.text(), { status: upstream.status });
        }

        const json = (await upstream.json()) as { data?: { b64_json?: string }[] };
        const b64 = json.data?.[0]?.b64_json;
        if (!b64) return new Response("Sem imagem retornada", { status: 502 });

        return Response.json({ image: `data:image/png;base64,${b64}` });
      },
    },
  },
});

