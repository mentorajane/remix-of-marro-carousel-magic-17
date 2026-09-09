export type Slide = {
  kicker: string;
  title: string;
  body: string;
};

export type CardTheme = {
  bg: string;
  text: string;
  highlight: string;
  highlightText: string;
  accent: string;
};

export const CARD_W = 1080;
export const CARD_H = 1350;
export const RATIOS = {
  "4:5": { w: 1080, h: 1350, label: "4:5" },
  "3:4": { w: 1080, h: 1440, label: "3:4" },
} as const;
export type RatioKey = keyof typeof RATIOS;

function Marked({
  text,
  theme,
  size,
}: {
  text: string;
  theme: CardTheme;
  size: "big" | "small";
}) {
  const parts = text.split(/(\*\*[^*]+\*\*|\/\/[^/]+\/\/)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const tilt = part.match(/^\/\/([^/]+)\/\/$/);
        if (tilt) {
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontStyle: "italic",
                transform: `rotate(${i % 2 === 0 ? -3.5 : 3}deg)`,
                backgroundColor: theme.accent,
                color: theme.bg,
                padding: size === "big" ? "2px 16px 10px" : "2px 10px 6px",
                margin: "0 6px",
                borderRadius: 3,
                boxShadow: "6px 8px 0 rgba(0,0,0,0.25)",
              }}
            >
              {tilt[1]}
            </span>
          );
        }
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        if (!m) return <span key={i}>{part}</span>;
        return (
          <span
            key={i}
            style={{
              backgroundColor: theme.highlight,
              color: theme.highlightText,
              padding: size === "big" ? "0 14px 8px" : "0 8px 4px",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              borderRadius: 4,
            }}
          >
            {m[1]}
          </span>
        );
      })}
    </>
  );
}


export function SlideCard({
  slide,
  index,
  total,
  theme,
  image,
  brand,
  isCover,
  height = CARD_H,
}: {
  slide: Slide;
  index: number;
  total: number;
  theme: CardTheme;
  image: string | null;
  brand: string;
  isCover: boolean;
  height?: number;
}) {
  return (
    <div
      style={{
        width: CARD_W,
        height,
        backgroundColor: theme.bg,
        color: theme.text,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Barlow", sans-serif',
      }}
    >
      {isCover && image ? (
        <>
          <img
            src={image}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "grayscale(0.35) contrast(1.08)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(to top, ${theme.bg} 0%, ${theme.bg}99 25%, ${theme.bg}4d 50%, transparent 75%)`,
            }}
          />
        </>
      ) : null}

      {/* masthead */}
      <div
        style={{
          position: "relative",
          padding: "56px 64px 0",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: isCover ? 108 : 46,
            lineHeight: 0.85,
            letterSpacing: isCover ? "-2px" : "2px",
            color: theme.text,
          }}
        >
          {brand}
        </span>
        <span
          style={{
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>

      {isCover ? (
        <div
          style={{
            position: "relative",
            height: 6,
            margin: "26px 64px 0",
            background: `linear-gradient(90deg, ${theme.accent} 0%, ${theme.highlight} 100%)`,
          }}
        />
      ) : null}

      <div style={{ flex: 1 }} />

      <div style={{ position: "relative", padding: "0 64px 72px" }}>
        {slide.kicker ? (
          <span
            style={{
              display: "inline-block",
              backgroundColor: theme.accent,
              color: theme.bg,
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: 5,
              textTransform: "uppercase",
              padding: "10px 18px",
              marginBottom: 28,
            }}
          >
            {slide.kicker}
          </span>
        ) : null}

        <h2
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: isCover ? 132 : 96,
            lineHeight: 0.92,
            letterSpacing: "-1px",
            margin: 0,
            textTransform: "uppercase",
          }}
        >
          <Marked text={slide.title} theme={theme} size="big" />
        </h2>

        {slide.body ? (
          <p
            style={{
              marginTop: 32,
              fontSize: 38,
              lineHeight: 1.4,
              fontWeight: 400,
              opacity: 0.88,
              maxWidth: 880,
            }}
          >
            <Marked text={slide.body} theme={theme} size="small" />
          </p>
        ) : null}

        <div
          style={{
            marginTop: 48,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            opacity: 0.6,
          }}
        >
          <span>{isCover ? "Arrasta" : brand}</span>
          <span>{index + 1 < total ? "→" : "Salve este post"}</span>
        </div>
      </div>
    </div>
  );
}
