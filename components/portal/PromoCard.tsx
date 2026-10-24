import type { PromoContent } from "@/lib/promotions";

// CSS fijo (sin datos del cliente). Lo usan la página pública de la campaña y la vista previa del panel.
const CSS = `
.pc{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111827}
.pc *{box-sizing:border-box}
.pc-box{width:100%;max-width:420px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.15)}
.pc-img{display:block;width:100%;max-height:260px;object-fit:cover}
.pc-body{padding:20px}
.pc h1{font-size:22px;margin:0 0 8px}
.pc p{margin:0 0 16px;line-height:1.45;white-space:pre-wrap}
.pc-cta{display:block;text-align:center;padding:12px;border-radius:8px;background:var(--pc-primary,#1d4ed8);color:var(--pc-on,#fff);font-weight:600;text-decoration:none}
.pc-next{display:block;text-align:center;margin-top:12px;font-size:14px;color:#374151}
`;

type Props = {
  content: PromoContent;
  imageSrc: string | null;     // ya resuelta por el llamador
  ctaHref: string | null;      // enlace de seguimiento (/go), no el externo
  nextHref?: string;           // destino original del visitante
  nextLabel?: string;
  primary?: string;            // color de marca del portal, ya validado (#RRGGBB)
  onPrimary?: string;
};

export default function PromoCard({ content, imageSrc, ctaHref, nextHref, nextLabel = "Continuar a internet", primary, onPrimary }: Props) {
  const style = primary ? ({ "--pc-primary": primary, "--pc-on": onPrimary ?? "#fff" } as React.CSSProperties) : undefined;
  return (
    <div className="pc" style={style}>
      <style>{CSS}</style>
      <div className="pc-box">
        {imageSrc && <img className="pc-img" src={imageSrc} alt="" />}
        <div className="pc-body">
          <h1>{content.title}</h1>
          {content.body && <p>{content.body}</p>}
          {ctaHref && content.cta_label && <a className="pc-cta" href={ctaHref} rel="noopener noreferrer">{content.cta_label}</a>}
          {nextHref && <a className="pc-next" href={nextHref} rel="noopener noreferrer">{nextLabel}</a>}
        </div>
      </div>
    </div>
  );
}
