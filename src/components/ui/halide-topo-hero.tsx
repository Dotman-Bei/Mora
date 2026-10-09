"use client";

import { Syncopate } from "next/font/google";
import Link from "next/link";
import { Fragment, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// The Halide hero, used as Mora's landing hero as given (owner's choice; see
// DECISIONS D-017): dark ground, Syncopate, orange accent, grayscale photo
// layers, film grain, contour rings and mouse parallax.
//
// Changed only so it can live inside a page:
// - styles are scoped under .halide-body (the original wrote :root, which
//   overrode the site's --accent everywhere, and used global class names);
// - grain and interface use position:absolute, not fixed, so they stay in the
//   hero instead of covering the whole site;
// - width is 100%, not 100vw, so the page doesn't scroll sideways;
// - reduced motion skips the entrance and the parallax (PRD §14);
// - copy is Mora's, and the CTA links to /send.

// Only bold is used: the readouts and footnote set their own monospace face.
const syncopate = Syncopate({ weight: "700", subsets: ["latin"], display: "swap" });

export interface HalideTopoHeroProps {
  readouts: [string, string];
  /** One entry per line on wide screens; phones let it flow. */
  title: string[];
  footnote: [string, string];
  cta: { label: string; href: string };
  className?: string;
}

export function HalideTopoHero({ readouts, title, footnote, cta, className }: HalideTopoHeroProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.style.opacity = "1";
      canvas.style.transform = "rotateX(55deg) rotateZ(-25deg) scale(1)";
      return;
    }

    // Mouse parallax
    const handleMouseMove = (e: MouseEvent) => {
      const x = (window.innerWidth / 2 - e.pageX) / 25;
      const y = (window.innerHeight / 2 - e.pageY) / 25;
      canvas.style.transform = `rotateX(${55 + y / 2}deg) rotateZ(${-25 + x / 2}deg)`;
      layersRef.current.forEach((layer, index) => {
        if (!layer) return;
        const depth = (index + 1) * 15;
        const moveX = x * (index + 1) * 0.2;
        const moveY = y * (index + 1) * 0.2;
        layer.style.transform = `translateZ(${depth}px) translate(${moveX}px, ${moveY}px)`;
      });
    };

    // Entrance animation
    canvas.style.opacity = "0";
    canvas.style.transform = "rotateX(90deg) rotateZ(0deg) scale(0.8)";
    const timeout = setTimeout(() => {
      canvas.style.transition = "all 2.5s cubic-bezier(0.16, 1, 0.3, 1)";
      canvas.style.opacity = "1";
      canvas.style.transform = "rotateX(55deg) rotateZ(-25deg) scale(1)";
    }, 300);

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      <style>{`
        .halide-body {
          --bg: #0a0a0a;
          --silver: #e0e0e0;
          --accent: #ff3c00;
          --grain-opacity: 0.15;
          position: relative;
          background-color: var(--bg);
          color: var(--silver);
          overflow: hidden;
          height: 100vh;
          min-height: 560px;
          width: 100%;
          margin: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .halide-body .halide-grain {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          pointer-events: none;
          z-index: 100;
          opacity: var(--grain-opacity);
        }
        .halide-body .viewport {
          perspective: 2000px;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden;
        }
        .halide-body .canvas-3d {
          position: relative;
          width: 800px; height: 500px;
          transform-style: preserve-3d;
          transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .halide-body .layer {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(224, 224, 224, 0.1);
          background-size: cover;
          background-position: center;
          transition: transform 0.5s ease;
        }
        .halide-body .layer-1 { background-image: url('/hero/layer-1.webp'); filter: grayscale(1) contrast(1.2) brightness(0.5); }
        .halide-body .layer-2 { background-image: url('/hero/layer-2.webp'); filter: grayscale(1) contrast(1.1) brightness(0.7); opacity: 0.6; mix-blend-mode: screen; }
        .halide-body .layer-3 { background-image: url('/hero/layer-3.webp'); filter: grayscale(1) contrast(1.3) brightness(0.8); opacity: 0.4; mix-blend-mode: overlay; }
        .halide-body .contours {
          position: absolute;
          width: 200%; height: 200%;
          top: -50%; left: -50%;
          background-image: repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 40px, rgba(255,255,255,0.05) 41px, transparent 42px);
          transform: translateZ(120px);
          pointer-events: none;
        }
        .halide-body .interface-grid {
          position: absolute;
          inset: 0;
          padding: 6rem 4rem 4rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto 1fr auto;
          z-index: 10;
          pointer-events: none;
        }
        .halide-body .hero-title {
          grid-column: 1 / -1;
          align-self: center;
          font-size: clamp(2.25rem, 5.8vw, 7rem);
          line-height: 1.22;
          letter-spacing: 0.01em;
          word-spacing: 0.08em;
          /* Syncopate's lowercase is mixed small caps; set it in capitals. */
          text-transform: uppercase;
          mix-blend-mode: difference;
          /* The original's h1 renders at the browser default (bold). */
          font-weight: 700;
          margin: 0;
        }
        .halide-body .cta-button {
          pointer-events: auto;
          background: var(--silver);
          color: var(--bg);
          padding: 1rem 2rem;
          text-decoration: none;
          font-weight: 700;
          clip-path: polygon(0 0, 100% 0, 100% 70%, 85% 100%, 0 100%);
          transition: 0.3s;
        }
        .halide-body .cta-button:hover { background: var(--accent); transform: translateY(-5px); }
        .halide-body .cta-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
        .halide-body .scroll-hint {
          position: absolute;
          bottom: 2rem; left: 50%;
          width: 1px; height: 60px;
          background: linear-gradient(to bottom, var(--silver), transparent);
          animation: halide-flow 2s infinite ease-in-out;
        }
        @keyframes halide-flow {
          0%, 100% { transform: scaleY(0); transform-origin: top; }
          50% { transform: scaleY(1); transform-origin: top; }
          51% { transform: scaleY(1); transform-origin: bottom; }
        }
        /* Phones: the same layout with room to breathe. */
        @media (max-width: 640px) {
          .halide-body .interface-grid { padding: 5.5rem 1.25rem 4.5rem; }
          .halide-body .hero-title br { display: none; }
          .halide-body .halide-bottom { flex-direction: column; align-items: flex-start !important; gap: 1.25rem; }
        }
      `}</style>

      <section className={cn("halide-body", syncopate.className, className)}>
        {/* SVG filter for grain */}
        <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden>
          <filter id="halide-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves={3} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </svg>

        <div className="halide-grain" style={{ filter: "url(#halide-grain)" }} aria-hidden />

        <div className="interface-grid">
          {/* The site header already carries the name, so the hero has no brand mark. */}
          <div style={{ gridColumn: 2, textAlign: "right", fontFamily: "monospace", color: "var(--accent)", fontSize: "0.7rem" }}>
            <div>{readouts[0]}</div>
            <div>{readouts[1]}</div>
          </div>

          <h1 className="hero-title">
            {title.map((line, i) => (
              <Fragment key={line}>
                {i > 0 ? (
                  <>
                    {" "}
                    <br />
                  </>
                ) : null}
                {line}
              </Fragment>
            ))}
          </h1>

          <div className="halide-bottom" style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
              <p>{footnote[0]}</p>
              <p>{footnote[1]}</p>
            </div>
            <Link href={cta.href} className="cta-button">
              {cta.label}
            </Link>
          </div>
        </div>

        <div className="viewport" aria-hidden>
          <div className="canvas-3d" ref={canvasRef}>
            <div className="layer layer-1" ref={(el) => { layersRef.current[0] = el; }} />
            <div className="layer layer-2" ref={(el) => { layersRef.current[1] = el; }} />
            <div className="layer layer-3" ref={(el) => { layersRef.current[2] = el; }} />
            <div className="contours" />
          </div>
        </div>

        <div className="scroll-hint" aria-hidden />
      </section>
    </>
  );
}
