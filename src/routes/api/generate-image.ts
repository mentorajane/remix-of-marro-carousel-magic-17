import { createFileRoute } from "@tanstack/react-router";

const IMAGE_MODEL =
  process.env["GEMINI_IMAGE_MODEL"] || "gemini-3.1-flash-image";

const HF_MODEL = "black-forest-labs/FLUX.1-schnell";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gemini =
          process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "";
        const hf = process.env["HF_TOKEN"] || process.env["HUGGINGFACE_TOKEN"] || "";

        const { prompt, headline } = (await request.json()) as {
          prompt: string;
          headline?: string;
        };
        const cleanHeadline = (headline ?? "")
          .replace(/\*\*/g, "")
          .replace(/\/\//g, "")
          .trim();
        const styledPrompt = cleanHeadline
          ? `${prompt}. Editorial magazine cover photography, high contrast, cinematic lighting, brown / black / white color grading. Render the headline "${cleanHeadline}" as large bold magazine cover typography over the image, with correct Portuguese spelling, short uppercase words, high legibility.`
          : `${prompt}. Editorial magazine cover photography, high contrast, cinematic lighting, brown / black / white color grading, no text, no letters.`;

        // 1) Gemini (melhor qualidade, precisa de cota)
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
                    parts?: {
                      text?: string;
                      inlineData?: { mimeType?: string; data?: string };
                    }[];
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
            console.error("Gemini image falhou, usando fallback HF");
          } catch (e) {
            console.error("Gemini image erro, usando fallback HF", e);
          }
        }

        // 2) Hugging Face FLUX (gratuito com HF_TOKEN)
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
                  parameters: { width: 1024, height: 1350 },
                }),
                signal: AbortSignal.timeout(55000),
              },
            );

            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              const ctype = res.headers.get("content-type") ?? "";
              if (ctype.startsWith("image/") && buf.length > 10000) {
                return Response.json({
                  image: `data:${ctype.split(";")[0]};base64,${buf.toString("base64")}`,
                });
              }
            }
            console.error("HF image falhou");
          } catch (e) {
            console.error("HF image erro", e);
          }
        }

        return Response.json(
          { error: "Nenhum serviço de imagem disponível" },
          { status: 503 },
        );
      },
    },
  },
});
