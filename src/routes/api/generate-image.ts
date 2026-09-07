import { createFileRoute } from "@tanstack/react-router";

const IMAGE_MODEL =
  process.env["GEMINI_IMAGE_MODEL"] || "gemini-2.5-flash-image";

const HF_MODEL = process.env["HF_IMAGE_MODEL"] || "Qwen/Qwen-Image";

function pollinationsUrl(prompt: string) {
  const text = encodeURIComponent(
    `${prompt}. Editorial magazine cover photography, high contrast, cinematic lighting, brown black white color grading, no text, no watermark.`,
  );
  return `https://image.pollinations.ai/prompt/${text}?width=1024&height=1536&nologo=true&model=flux`;
}

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gemini =
          process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "";
        const hf = process.env["HF_TOKEN"] || process.env["HUGGINGFACE_TOKEN"] || "";
        const lovable = process.env["LOVABLE_API_KEY"] || "";

        const { prompt, headline } = (await request.json()) as {
          prompt: string;
          headline?: string;
        };
        const cleanHeadline = (headline ?? "").replace(/\*\*/g, "").replace(/\/\//g, "").trim();
        const styledPrompt = cleanHeadline
          ? `${prompt}. Editorial magazine cover photography, high contrast, cinematic lighting, brown / black / white color grading. Render the headline "${cleanHeadline}" as large bold magazine cover typography over the image, with correct Portuguese spelling, short uppercase words, high legibility.`
          : `${prompt}. Editorial magazine cover photography, high contrast, cinematic lighting, brown / black / white color grading, no text, no letters.`;

        // 1) Gemini direto (Vercel + GEMINI_API_KEY) — melhor qualidade e texto na capa
        if (gemini) {
          try {
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

            if (res.ok) {
              const json = (await res.json()) as {
                candidates?: {
                  content?: {
                    parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[];
                  };
                }[];
              };
              const parts = json.candidates?.[0]?.content?.parts ?? [];
              const img = parts.find((p) => p.inlineData?.data);
              if (img?.inlineData?.data) {
                return Response.json({
                  image: `data:${img.inlineData.mimeType || "image/png"};base64,${img.inlineData.data}`,
                });
              }
            }
            // Qualquer falha (cota 429, modelo, etc.) cai para o fallback gratuito
            console.error("Gemini image falhou, usando fallback gratuito");
          } catch (e) {
            console.error("Gemini image erro, usando fallback gratuito", e);
          }
        }

        // 2) Hugging Face (grátis com HF_TOKEN): Qwen-Image, bom até com texto
        if (hf) {
          try {
            const res = await fetch(
              `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${hf}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  inputs: styledPrompt,
                  parameters: { width: 1024, height: 1536 },
                }),
                signal: AbortSignal.timeout(55000),
              },
            );

            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              // Resposta de imagem vem como bytes; erro viria como JSON
              const ctype = res.headers.get("content-type") ?? "";
              if (ctype.startsWith("image/") && buf.length > 10000) {
                return Response.json({
                  image: `data:${ctype.split(";")[0]};base64,${buf.toString("base64")}`,
                });
              }
            }
            console.error("HF image falhou, usando próximo fallback");
          } catch (e) {
            console.error("HF image erro, usando próximo fallback", e);
          }
        }

        // 3) Fallback Lovable (só com LOVABLE_API_KEY / créditos)
        if (lovable) {
          try {
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

            if (upstream.ok) {
              const json = (await upstream.json()) as { data?: { b64_json?: string }[] };
              const b64 = json.data?.[0]?.b64_json;
              if (b64) return Response.json({ image: `data:image/png;base64,${b64}` });
            }
          } catch (e) {
            console.error("Lovable image erro, usando fallback gratuito", e);
          }
        }

        // 4) Fallback gratuito (Pollinations, sem chave): foto de fundo, texto via app
        return Response.json({ image: pollinationsUrl(prompt), fallback: true });
      },
    },
  },
});
