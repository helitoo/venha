"use client";

import React, { useRef, useEffect } from "react";
import { useMascotContext } from "@/context/MascotContext";
import { CloudRain, X } from "lucide-react";

/**
 * Fullscreen atmospheric rain animation overlay on initial entry
 * Displays when it's raining or flooded, then gently fades out after a few seconds
 */
export default function RainAtmosphereOverlay() {
  const { isInitialRainActive, dismissInitialRain, mascotType, getMascotImage } =
    useMascotContext();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!isInitialRainActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const dropCount = 90;
    interface Drop {
      x: number;
      y: number;
      speed: number;
      len: number;
      opacity: number;
    }

    const drops: Drop[] = Array.from({ length: dropCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      speed: 12 + Math.random() * 8,
      len: 16 + Math.random() * 12,
      opacity: 0.2 + Math.random() * 0.4,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(186, 230, 253, 0.45)";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";

      drops.forEach((d) => {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 3, d.y + d.len);
        ctx.stroke();

        d.y += d.speed;
        d.x -= 2;

        if (d.y > height) {
          d.y = -d.len;
          d.x = Math.random() * width;
        }
        if (d.x < 0) {
          d.x = width;
        }
      });

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, [isInitialRainActive]);

  if (!isInitialRainActive) return null;

  const mascotImg = getMascotImage("rain");

  return (
    <div className="fixed inset-0 z-[2000] pointer-events-none transition-opacity duration-1000 animate-in fade-in">
      {/* Falling Rain Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Atmospheric entry notice toast */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-sky-500/40 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-500 max-w-[90vw] sm:max-w-md">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-sky-950/60 border border-sky-400/30 p-1 shrink-0">
            <img src={mascotImg} alt="Mascot" className="w-full h-full object-contain" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-sky-300">
              <CloudRain className="w-3.5 h-3.5 text-sky-400" />
              <span>Dự báo TP.HCM đang có mưa</span>
            </div>
            <p className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">
              {mascotType === "duck"
                ? "Vịt đang theo dõi các điểm ngập giúp bạn về nhà an toàn!"
                : "Mèo đang canh chừng đường ngập giúp bạn về nhà khô ráo!"}
            </p>
          </div>

          <button
            onClick={dismissInitialRain}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
