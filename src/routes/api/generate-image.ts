import { createFileRoute } from "@tanstack/react-router";

const IMAGE_MODEL =
  process.env["GEMINI_IMAGE_MODEL"] || "gemini-2.5-flash-image";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gemini =
          process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "";

        if (!gemini) {
          return Response.json(
            { error: "GEMINI_API_KEY não configurada" },
            { status: 500 },
          );
        }

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

          if (!res.ok) {
            const errText = await res.text();
            console.error("Gemini image erro:", res.status, errText);
            return Response.json(
              { error: `Gemini falhou: ${res.status}` },
              { status: 502 },
            );
          }

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

          console.error("Gemini não retornou imagem");
          return Response.json(
            { error: "Gemini não retornou imagem" },
            { status: 502 },
          );
        } catch (e) {
          console.error("Gemini image erro:", e);
          return Response.json(
            { error: "Erro ao conectar com Gemini" },
            { status: 500 },
          );
        }
      },
    },
  },
});
