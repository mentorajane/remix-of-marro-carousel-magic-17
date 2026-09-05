import { createFileRoute } from "@tanstack/react-router";

const TRANSCRIBE_MODEL = process.env["GEMINI_MODEL"] || "gemini-2.0-flash";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gemini =
          process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "";
        const lovable = process.env["LOVABLE_API_KEY"] || "";

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File) || file.size < 2048) {
          return new Response("Áudio vazio ou muito curto", { status: 400 });
        }

        // 1) Gemini direto: envia o áudio como inlineData
        if (gemini) {
          const buf = Buffer.from(await file.arrayBuffer());
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${encodeURIComponent(gemini)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: "Transcreva este áudio em português do Brasil, de forma literal, sem comentários. Retorne apenas a transcrição.",
                      },
                      {
                        inlineData: {
                          mimeType: file.type || "audio/wav",
                          data: buf.toString("base64"),
                        },
                      },
                    ],
                  },
                ],
              }),
            },
          );
          if (!res.ok) {
            return new Response((await res.text()) || "Falha na transcrição", {
              status: res.status,
            });
          }
          const json = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text =
            json.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? "")
              .join("") ?? "";
          return Response.json({ text });
        }

        // 2) Fallback Lovable
        if (!lovable) {
          return new Response(
            "Missing GEMINI_API_KEY. Configure GEMINI_API_KEY nas Environment Variables da Vercel.",
            { status: 500 },
          );
        }

        const upstream = new FormData();
        upstream.append("model", "openai/gpt-4o-mini-transcribe");
        upstream.append("file", file, "recording.wav");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovable}` },
          body: upstream,
        });
        if (!res.ok) {
          return new Response((await res.text()) || "Falha na transcrição", { status: res.status });
        }
        const json = (await res.json()) as { text?: string };
        return Response.json({ text: json.text ?? "" });
      },
    },
  },
});
