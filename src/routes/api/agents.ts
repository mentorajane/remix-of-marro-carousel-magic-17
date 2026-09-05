import { createFileRoute } from "@tanstack/react-router";

type Body = {
  stage: "pesquisar" | "criar" | "revisar" | "postar" | "pacote";
  topic?: string;
  niche?: string;
  research?: string;
  slides?: unknown;
  slideCount?: number;
  keywords?: string[];
};

const GEMINI_MODEL = process.env["GEMINI_MODEL"] || "gemini-2.0-flash";

function getKeys() {
  return {
    gemini:
      process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"] || "",
    lovable: process.env["LOVABLE_API_KEY"] || "",
  };
}

function kw(b: Body) {
  const list = (b.keywords || []).filter(Boolean);
  return list.length
    ? `PALAVRAS-CHAVE OBRIGATÓRIAS do nicho (distribua naturalmente nos títulos, no corpo, na legenda e nas hashtags): ${list.join(", ")}.`
    : "";
}

function promptFor(b: Body): { system: string; user: string } {
  const base = `Você é um time de agentes de conteúdo para Instagram no Brasil. Responda SEMPRE em português do Brasil e SEMPRE em JSON válido, sem markdown, sem crases.`;

  switch (b.stage) {
    case "pesquisar":
      return {
        system: base,
        user: `AGENTE PESQUISADOR. Nicho: "${b.niche}". Tema: "${b.topic}".
${kw(b)}
Pesquise mentalmente ângulos, dores, objeções e dados plausíveis.
Responda JSON: {"resumo": string (até 400 caracteres), "angulos": string[5], "palavrasChave": string[6]}`,
      };
    case "criar":
      return {
        system: base,
        user: `AGENTE CRIADOR. Nicho: "${b.niche}". Tema: "${b.topic}".
Pesquisa: ${b.research || "(sem pesquisa)"}
${kw(b)}
Crie um carrossel de ${b.slideCount || 6} cards. O card 1 é CAPA estilo revista (headline curtíssima e impactante, máx 6 palavras).
Use **asteriscos duplos** ao redor de 1 a 3 palavras-chave que devem ser marcadas em cada título.
Use //barras duplas// ao redor de 1 palavra por card (em alguns cards, não em todos) para virar uma palavra inclinada estilo colagem de revista. Nunca use as duas marcações na mesma palavra.
Responda JSON:
{"slides":[{"kicker": string curto (máx 3 palavras), "title": string, "body": string (até 160 caracteres, vazio na capa)}],
 "legenda": string (legenda pronta para postar com quebras de linha),
 "hashtags": string[8],
 "promptImagem": string (prompt em inglês para gerar a foto de capa, fotografia editorial)}`,
      };
    case "revisar":
      return {
        system: base,
        user: `AGENTE REVISOR. Revise ortografia, corte gordura, aumente clareza e força de copy. Mantenha a MESMA estrutura e quantidade de slides. Mantenha as marcações **palavra** e //palavra//.
${kw(b)}
Conteúdo atual: ${JSON.stringify(b.slides)}
Responda JSON: {"slides":[{"kicker":string,"title":string,"body":string}], "notas": string[3]}`,
      };
    case "pacote":
      return {
        system: base,
        user: `AGENTE DE PACOTE DE CARDS PRONTOS PARA VENDER. Nicho: "${b.niche}". Ideia do cliente: "${b.topic}".
${kw(b)}
Crie ${b.slideCount || 8} CARDS INDEPENDENTES (cada um é um post avulso que pode ser vendido separadamente), variando os ângulos: dor, dica prática, mito x verdade, bastidores, prova social, oferta, autoridade e CTA.
Use **asteriscos duplos** em 1 a 3 palavras do título e //barras duplas// em 1 palavra em alguns cards (colagem inclinada).
Responda JSON:
{"cards":[{"kicker": string curto (máx 3 palavras), "title": string (máx 8 palavras), "body": string (até 140 caracteres), "angulo": string curto, "legenda": string (legenda pronta), "hashtags": string[5]}]}`,
      };
    case "postar":
      return {
        system: base,
        user: `AGENTE DE PUBLICAÇÃO. Com base nos cards: ${JSON.stringify(b.slides)} e no nicho "${b.niche}".
${kw(b)}
Responda JSON: {"legenda": string (copy pronta para o Instagram, com CTA e quebras de linha), "hashtags": string[10], "melhorHorario": string, "primeiroComentario": string}`,
      };
  }
}

function extractJson(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta inválida do modelo");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export const Route = createFileRoute("/api/agents")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { gemini, lovable } = getKeys();
        const body = (await request.json()) as Body;
        const { system, user } = promptFor(body);

        // 1) Caminho principal: Gemini direto (funciona na Vercel com GEMINI_API_KEY)
        if (gemini) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(gemini)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: system }] },
                contents: [{ parts: [{ text: user }] }],
                generationConfig: {
                  temperature: 0.7,
                  responseMimeType: "application/json",
                },
              }),
            },
          );

          if (!res.ok) {
            const text = await res.text();
            return new Response(text || "Erro no Gemini", { status: res.status });
          }

          const json = (await res.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const content =
            json.candidates?.[0]?.content?.parts
              ?.map((p) => p.text ?? "")
              .join("") ?? "";
          try {
            return Response.json(extractJson(content));
          } catch {
            return new Response("Não foi possível interpretar a resposta da IA", {
              status: 502,
            });
          }
        }

        // 2) Fallback: gateway Lovable (só funciona com LOVABLE_API_KEY / créditos)
        if (!lovable) {
          return new Response(
            "Missing GEMINI_API_KEY. Configure GEMINI_API_KEY nas Environment Variables da Vercel (pegue grátis em aistudio.google.com).",
            { status: 500 },
          );
        }

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovable}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          return new Response(text || "Erro no gateway", { status: res.status });
        }

        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content ?? "";
        try {
          return Response.json(extractJson(content));
        } catch {
          return new Response("Não foi possível interpretar a resposta da IA", {
            status: 502,
          });
        }
      },
    },
  },
});
