"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A tilted 3D stage of stacked layers over topographic contour lines, with an
 * entrance tilt and pointer parallax. Adapted from the "Halide" hero to Mora's
 * system (frontend.md): no colour of its own, hairlines, square corners, and
 * the content is whatever layers the caller passes (Mora passes its own
 * product screens, back to front).
 *
 * Safe by construction:
 * - CSS is scoped to the component; it never touches :root tokens.
 * - The entrance is a CSS animation, so content shows even without JS, and the
 *   global reduced-motion rule snaps it to rest.
 * - Parallax runs only for a fine pointer that can hover, never for touch or
 *   reduced motion, and is throttled to one update per frame.
 * - The tilt is gentler below md so phones keep a readable stage.
 * - Layers are composed on a fixed 800x500 stage that scales to fit its
 *   container, so content keeps its proportions at every width.
 */
const STAGE_W = 800;

export interface HalideTopoHeroProps {
  /** Layers from back to front. Each fills the stage; position content inside it. */
  layers: ReactNode[];
  /** Topographic contour rings floating above the layers. */
  contours?: boolean;
  /** Distance between layers along the Z axis, in px. */
  depth?: number;
  /** Accessible description of the whole illustration. */
  label: string;
  className?: string;
}

export function HalideTopoHero({ layers, contours = true, depth = 28, label, className }: HalideTopoHeroProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Fit the 800x500 composition to the container's width.
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const fit = () => canvas.style.setProperty("--fit", String(Math.min(1, (stage.clientWidth * 0.94) / STAGE_W)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reduced) return;

    let frame = 0;
    let px = 0;
    let py = 0;
    const apply = () => {
      frame = 0;
      const css = getComputedStyle(canvas);
      const tx = parseFloat(css.getPropertyValue("--tilt-x")) || 0;
      const tz = parseFloat(css.getPropertyValue("--tilt-z")) || 0;
      // Same response as the original: a few degrees of rotation, layers drift
      // further the closer they are.
      canvas.style.transform = `rotateX(${tx + py / 2}deg) rotateZ(${tz + px / 2}deg) scale(var(--fit, 1))`;
      layerRefs.current.forEach((layer, i) => {
        if (!layer) return;
        const k = (i + 1) * 0.2;
        layer.style.transform = `translateZ(${(i + 1) * depth}px) translate(${px * k}px, ${py * k}px)`;
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px = Math.max(-12, Math.min(12, (window.innerWidth / 2 - e.clientX) / 25));
      py = Math.max(-12, Math.min(12, (window.innerHeight / 2 - e.clientY) / 25));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    // Start following the pointer once the entrance has settled.
    const start = window.setTimeout(() => window.addEventListener("pointermove", onMove, { passive: true }), 1800);
    return () => {
      window.clearTimeout(start);
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [depth]);

  return (
    <div ref={stageRef} role="img" aria-label={label} className={cn("halide-stage relative flex items-center justify-center", className)}>
      <div
        ref={canvasRef}
        className="halide-canvas relative h-[500px] w-[800px] shrink-0 [--tilt-x:34deg] [--tilt-z:-12deg] md:[--tilt-x:50deg] md:[--tilt-z:-20deg]"
      >
        {layers.map((layer, i) => (
          <div
            key={i}
            ref={(el) => {
              layerRefs.current[i] = el;
            }}
            className="halide-layer absolute inset-0"
            style={{ transform: `translateZ(${(i + 1) * depth}px)` }}
          >
            {layer}
          </div>
        ))}
        {contours ? (
          <div aria-hidden className="halide-contours pointer-events-none absolute -inset-1/2" style={{ transform: `translateZ(${(layers.length + 1) * depth}px)` }} />
        ) : null}
      </div>
    </div>
  );
}

/** A hairline that flows downward under the hero: there's more below. */
export function ScrollHint({ className }: { className?: string }) {
  return <div aria-hidden className={cn("halide-scroll-hint pointer-events-none h-14 w-px", className)} />;
}
