import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { getFontEmbedCSS } from "@/lib/font-embed";

import JSZip from "jszip";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { SlideCard, CARD_W, CARD_H, RATIOS, type RatioKey, type Slide, type CardTheme } from "@/components/SlideCard";
import { startRecording, type VoiceRecorder } from "@/lib/recorder";
import { DEFAULT_NICHES, loadNiches, type Niche } from "@/lib/niches";
import {
  Loader2,
  Download,
  Upload,
  Sparkles,
  Search,
  Wand2,
  CheckCheck,
  Send,
  Mic,
  Square,
  Tags,
  Plus,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Esteira de Carrossel | Pesquisa, cria, revisa e exporta PNG" },
      {
        name: "description",
        content:
          "Esteira com agentes de IA que pesquisam, criam, revisam e preparam carrosséis 4:5 com capa estilo revista e exportação em PNG.",
      },
      { property: "og:title", content: "Esteira de Carrossel com agentes de IA" },
      {
        property: "og:description",
        content:
          "Gere carrosséis 4:5 prontos para postar: conteúdo, imagem de capa, cores, marcador de palavras e export PNG.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const THEMES: { name: string; theme: CardTheme }[] = [
  {
    name: "Preto / Marrom",
    theme: {
      bg: "#121110",
      text: "#F5F1EA",
      highlight: "#7A4A24",
      highlightText: "#FFFFFF",
      accent: "#B87333",
    },
  },
  {
    name: "Branco / Marrom",
    theme: {
      bg: "#F5F1EA",
      text: "#121110",
      highlight: "#7A4A24",
      highlightText: "#F5F1EA",
      accent: "#3A2A1E",
    },
  },
  {
    name: "Marrom sólido",
    theme: {
      bg: "#4A2F1C",
      text: "#F5F1EA",
      highlight: "#F5F1EA",
      highlightText: "#4A2F1C",
      accent: "#C9A227",
    },
  },
  {
    name: "Preto / Branco",
    theme: {
      bg: "#0B0B0B",
      text: "#FFFFFF",
      highlight: "#FFFFFF",
      highlightText: "#0B0B0B",
      accent: "#8C8C8C",
    },
  },
];

const DEFAULT_SLIDES: Slide[] = [
  {
    kicker: "Edição 01",
    title: "O post que **para o dedo**",
    body: "",
  },
  {
    kicker: "Contexto",
    title: "Ninguém para no **card 1**",
    body: "Sem capa forte, o resto do carrossel não existe. Comece pelo impacto visual.",
  },
  {
    kicker: "Método",
    title: "Uma ideia **por card**",
    body: "Cada card entrega um único argumento. Simples de ler, fácil de arrastar.",
  },
  {
    kicker: "Ação",
    title: "Feche com **CTA claro**",
    body: "Diga exatamente o que a pessoa deve fazer agora: salvar, comentar ou chamar no direct.",
  },
];

type Stage = "pesquisar" | "criar" | "revisar" | "postar";

async function callAgent(payload: Record<string, unknown>) {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Limite de requisições atingido. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos.");
    throw new Error(text || "Falha no agente");
  }
  return res.json();
}

function Index() {
  const [topic, setTopic] = useState("");
  const [niches, setNiches] = useState<Niche[]>(DEFAULT_NICHES);
  const [niche, setNiche] = useState<string>(DEFAULT_NICHES[0]!.name);
  const [brand, setBrand] = useState("REVISTA");
  const [themeIdx, setThemeIdx] = useState(0);
  const [custom, setCustom] = useState<CardTheme | null>(null);
  const [slides, setSlides] = useState<Slide[]>(DEFAULT_SLIDES);
  const [images, setImages] = useState<(string | null)[]>([]);
  const [research, setResearch] = useState("");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState<Stage | "imagem" | "export" | "voz" | null>(null);
  const [ratio, setRatio] = useState<RatioKey>("4:5");
  const [recording, setRecording] = useState(false);
  const [voiceStep, setVoiceStep] = useState("");
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [previewW, setPreviewW] = useState(300);

  useEffect(() => {
    const fit = () => setPreviewW(Math.max(220, Math.min(300, window.innerWidth - 72)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const list = loadNiches();
    setNiches(list);
    setNiche((cur) => (list.some((n) => n.name === cur) ? cur : list[0]!.name));
  }, []);

  const keywords = useMemo(
    () => niches.find((n) => n.name === niche)?.keywords ?? [],
    [niches, niche],
  );

  const theme = custom ?? THEMES[themeIdx]!.theme;
  const cardH = RATIOS[ratio].h;
  const previewH = Math.round((previewW / CARD_W) * cardH);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  async function toggleMic() {
    if (recording) {
      setRecording(false);
      const rec = recorderRef.current;
      recorderRef.current = null;
      if (!rec) return;
      setLoading("voz");
      setVoiceStep("Transcrevendo sua ideia…");
      try {
        const blob = await rec.stop();
        if (blob.size < 2048) throw new Error("Gravação vazia. Fale mais um pouco.");
        const fd = new FormData();
        fd.append("file", blob, "recording.wav");
        const res = await fetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) throw new Error((await res.text()) || "Falha na transcrição");
        const { text } = (await res.json()) as { text: string };
        if (!text.trim()) throw new Error("Não entendi o áudio. Tente de novo.");
        setTopic(text.trim());
        await autoPipeline(text.trim());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro no microfone");
        setLoading(null);
      } finally {
        setVoiceStep("");
      }
      return;
    }
    try {
      recorderRef.current = await startRecording();
      setRecording(true);
      toast.success("Gravando… fale sua ideia e toque para parar");
    } catch {
      toast.error("Permita o acesso ao microfone para usar a voz");
    }
  }

  async function autoPipeline(spokenTopic: string) {
    setLoading("voz");
    try {
      setVoiceStep("Pesquisando o tema…");
      const r = await callAgent({ stage: "pesquisar", topic: spokenTopic, niche, keywords });
      const researchTxt = `${r.resumo}\n\nÂngulos: ${(r.angulos || []).join(" | ")}`;
      setResearch(researchTxt);

      setVoiceStep("Criando os cards…");
      const c = await callAgent({
        stage: "criar",
        topic: spokenTopic,
        niche,
        keywords,
        research: researchTxt,
        slideCount: 6,
      });
      const newSlides: Slide[] = c.slides || [];
      setSlides(newSlides);

      setVoiceStep("Revisando a copy…");
      const rev = await callAgent({ stage: "revisar", topic: spokenTopic, niche, keywords, slides: newSlides });
      const finalSlides: Slide[] = rev.slides || newSlides;
      setSlides(finalSlides);

      setVoiceStep("Montando legenda e hashtags…");
      const p = await callAgent({ stage: "postar", topic: spokenTopic, niche, keywords, slides: finalSlides });
      const tags = (p.hashtags || c.hashtags || []).slice(0, 5).join(" ");
      setCaption(`${p.legenda || c.legenda || ""}\n\n${tags}`);

      if (c.promptImagem) {
        setVoiceStep("Gerando a capa…");
        await generateImage(c.promptImagem);
      }
      toast.success("Carrossel pronto para postar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na esteira automática");
    } finally {
      setVoiceStep("");
      setLoading(null);
    }
  }

  function patchTheme(patch: Partial<CardTheme>) {
    setCustom({ ...theme, ...patch });
  }

  async function run(stage: Stage) {
    if (stage !== "postar" && stage !== "revisar" && !topic.trim()) {
      toast.error("Escreva o tema do carrossel");
      return;
    }
    setLoading(stage);
    try {
      const data = await callAgent({
        stage,
        topic,
        niche,
        keywords,
        research,
        slides,
        slideCount: 6,
      });

      if (stage === "pesquisar") {
        const txt = `${data.resumo}\n\nÂngulos: ${(data.angulos || []).join(" | ")}`;
        setResearch(txt);
        toast.success("Pesquisa concluída");
      } else if (stage === "criar") {
        setSlides(data.slides || []);
        if (data.legenda)
          setCaption(`${data.legenda}\n\n${(data.hashtags || []).join(" ")}`);
        if (data.promptImagem) await generateImage(data.promptImagem);
        toast.success("Carrossel criado");
      } else if (stage === "revisar") {
        setSlides(data.slides || slides);
        toast.success("Revisado e desenferrujado");
      } else {
        setCaption(
          `${data.legenda}\n\n${(data.hashtags || []).join(" ")}\n\nMelhor horário: ${data.melhorHorario}\n1º comentário: ${data.primeiroComentario}`,
        );
        toast.success("Pacote de publicação pronto");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(null);
    }
  }

    function coverHeadline() {
    const raw = slides[0]?.title ?? topic;
    return raw.replace(/\*\*/g, "").replace(/\/\//g, "").trim();
  }

  async function generateImage(idx: number, prompt?: string) {
    const p = prompt || `${topic} — ${niche} — ${keywords.join(", ")}`;
    setLoading("imagem");
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, headline: slides[idx]?.title }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { image: string };
      setImages((prev) => {
        const next = [...prev];
        next[idx] = data.image;
        return next;
      });
      toast.success("Imagem gerada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar imagem");
    } finally {
      setLoading(null);
    }
  }

  function onUpload(idx: number, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImages((prev) => {
        const next = [...prev];
        next[idx] = String(reader.result);
        return next;
      });
    };
    reader.readAsDataURL(file);
  }

  async function exportPng(all: boolean) {
    setLoading("export");
    try {
      const nodes = cardRefs.current.filter(Boolean) as HTMLDivElement[];
      if (!nodes.length) throw new Error("Nada para exportar");
      const targets = all ? nodes : [nodes[0]!];
      const fontEmbedCSS = await getFontEmbedCSS();
      const pngs: { name: string; data: string }[] = [];
      for (let i = 0; i < targets.length; i++) {
        const opts = { width: CARD_W, height: cardH, pixelRatio: 1, fontEmbedCSS };
        // duas passadas: garante fontes/imagens carregadas no snapshot
        await toPng(targets[i]!, opts);
        const dataUrl = await toPng(targets[i]!, opts);
        pngs.push({ name: `card-${String(i + 1).padStart(2, "0")}.png`, data: dataUrl });
      }


      if (pngs.length === 1) {
        const a = document.createElement("a");
        a.href = pngs[0]!.data;
        a.download = pngs[0]!.name;
        a.click();
      } else {
        const zip = new JSZip();
        for (const p of pngs) zip.file(p.name, p.data.split(",")[1]!, { base64: true });
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "carrossel-png.zip";
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success("PNG exportado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no export");
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;

  return (
    <main className="min-h-screen bg-background font-sans text-foreground">
      <Toaster position="top-center" />

      <header className="border-b border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-5">
          <span className="truncate font-display text-xl tracking-wide sm:text-2xl">
            ESTEIRA<span className="text-primary">.</span>CARROSSEL
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.25em] text-muted-foreground sm:block">
            4:5 · 1080×1350 · PNG
          </span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 sm:px-5 sm:py-8 lg:grid-cols-[380px_1fr]">
        {/* Painel */}
        <section className="min-w-0 space-y-6">
          <div className="space-y-3">
            <h1 className="font-display text-3xl leading-none sm:text-4xl">
              Conteúdo, capa e PNG prontos para postar
            </h1>
            <p className="text-sm text-muted-foreground">
              Agentes que pesquisam, criam, revisam e montam o pacote de publicação.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Nicho</Label>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/nichos">
                  <Tags /> Palavras-chave
                </Link>
              </Button>
            </div>
            <Select value={niche} onValueChange={setNiche}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {niches.map((n) => (
                  <SelectItem key={n.name} value={n.name}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {keywords.length ? (
              <div className="flex flex-wrap gap-1">
                {keywords.map((k) => (
                  <span
                    key={k}
                    className="border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
                  >
                    {k}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nenhuma palavra-chave definida para este nicho.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tema do carrossel</Label>
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: 3 erros que travam o emagrecimento depois dos 30"
              rows={3}
            />
          </div>

          <div className="space-y-2 border border-border bg-card p-4">
            <Label>Falar a ideia</Label>
            <p className="text-xs text-muted-foreground">
              Toque no microfone, fale o tema e a IA monta o carrossel inteiro + legenda com 5 hashtags.
            </p>
            <Button
              className="w-full"
              variant={recording ? "destructive" : "default"}
              disabled={busy && !recording}
              onClick={toggleMic}
            >
              {loading === "voz" ? (
                <Loader2 className="animate-spin" />
              ) : recording ? (
                <Square />
              ) : (
                <Mic />
              )}
              {recording ? "Parar e gerar" : "Falar minha ideia"}
            </Button>
            {voiceStep ? (
              <p className="text-xs uppercase tracking-[0.2em] text-primary">{voiceStep}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>Marca / masthead</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value.toUpperCase())} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button variant="outline" disabled={busy} onClick={() => run("pesquisar")}>
              {loading === "pesquisar" ? <Loader2 className="animate-spin" /> : <Search />}
              Pesquisar
            </Button>
            <Button disabled={busy} onClick={() => run("criar")}>
              {loading === "criar" ? <Loader2 className="animate-spin" /> : <Wand2 />}
              Criar
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => run("revisar")}>
              {loading === "revisar" ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Revisar
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => run("postar")}>
              {loading === "postar" ? <Loader2 className="animate-spin" /> : <Send />}
              Postar
            </Button>
          </div>

          {research ? (
            <div className="border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
              {research}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Imagem da capa</Label>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                disabled={busy}
                onClick={() => generateImage(0)}
              >
                {loading === "imagem" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Gerar com IA
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <label className="cursor-pointer">
                  <Upload />
                  Subir imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onUpload(0, e.target.files?.[0])}
                  />
                </label>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Formato do card</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
              {(Object.keys(RATIOS) as RatioKey[]).map((r) => (
                <Button
                  key={r}
                  variant={ratio === r ? "default" : "outline"}
                  onClick={() => setRatio(r)}
                >
                  {RATIOS[r].label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quantidade de cards: {slides.length}</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSlides((prev) => [
                    ...prev,
                    { kicker: "", title: "Novo card", body: "" },
                  ]);
                }}
              >
                <Plus /> Adicionar
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={slides.length <= 1}
                onClick={() => {
                  setSlides((prev) => prev.slice(0, -1));
                  setImages((prev) => prev.slice(0, -1));
                }}
              >
                <Trash2 /> Remover
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Paleta do card</Label>
            <div className="grid grid-cols-4 gap-2">
              {THEMES.map((t, i) => (
                <button
                  key={t.name}
                  title={t.name}
                  onClick={() => {
                    setThemeIdx(i);
                    setCustom(null);
                  }}
                  className={`h-10 border ${!custom && themeIdx === i ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
                  style={{
                    background: `linear-gradient(90deg, ${t.theme.bg} 60%, ${t.theme.accent} 60%)`,
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {(
                [
                  ["Fundo", "bg"],
                  ["Texto", "text"],
                  ["Marcador", "highlight"],
                  ["Texto marcado", "highlightText"],
                  ["Detalhe", "accent"],
                ] as const
              ).map(([label, key]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => patchTheme({ [key]: e.target.value })}
                    className="h-8 w-10 cursor-pointer border border-border bg-transparent"
                  />
                  <span className="text-muted-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button variant="outline" disabled={busy} onClick={() => exportPng(false)}>
              <Download /> Só a capa
            </Button>
            <Button disabled={busy} onClick={() => exportPng(true)}>
              {loading === "export" ? <Loader2 className="animate-spin" /> : <Download />}
              Todos (.zip)
            </Button>
          </div>
        </section>

        {/* Preview */}
        <section className="min-w-0 space-y-6">
          <Carousel opts={{ align: "start" }} className="w-full max-w-full overflow-hidden carousel-scroll">
            <CarouselContent className="-ml-4">
              {slides.map((s, i) => (
                <CarouselItem key={i} className="basis-auto pl-4">
                  <div className="space-y-2">
                    <div
                      className="relative overflow-hidden border border-border"
                      style={{ width: previewW, height: previewH }}
                    >
                      <div
                        className="absolute left-0 top-0 origin-top-left"
                        style={{
                          width: CARD_W,
                          height: cardH,
                          transform: `scale(${previewW / CARD_W})`,
                        }}
                      >

                        <div ref={(el) => { cardRefs.current[i] = el; }}>
                          <SlideCard
                            slide={s}
                            index={i}
                            total={slides.length}
                            theme={theme}
                            image={images[i] ?? null}
                            brand={brand}
                            isCover={i === 0}
                            height={cardH}
                          />
                        </div>
                      </div>
                    </div>
                    <Textarea
                      rows={3}
                      className="text-xs"
                      value={`${s.kicker}\n${s.title}\n${s.body}`}
                      onChange={(e) => {
                        const [kicker = "", title = "", ...rest] = e.target.value.split("\n");
                        const next = [...slides];
                        next[i] = { kicker, title, body: rest.join(" ") };
                        setSlides(next);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        disabled={busy}
                        onClick={() => generateImage(i)}
                      >
                        {loading === "imagem" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                        Gerar
                      </Button>
                      <Button variant="outline" size="sm" asChild className="flex-1">
                        <label className="cursor-pointer">
                          <Upload />
                          Subir
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => onUpload(i, e.target.files?.[0])}
                          />
                        </label>
                      </Button>
                    </div>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden sm:flex" />
            <CarouselNext className="hidden sm:flex" />
          </Carousel>

          <div className="space-y-2">
            <Label>Legenda pronta para postar</Label>
            <Textarea
              rows={8}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Rode o agente Criar ou Postar para gerar a legenda."
            />
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(caption);
                toast.success("Legenda copiada");
              }}
            >
              Copiar legenda
            </Button>
          </div>
        </section>
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Capa estilo revista · marrom, preto e branco · export PNG 1080×1350
        </div>
      </footer>
    </main>
  );
}
