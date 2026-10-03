"use client";

import React, { useRef, useEffect } from "react";
import { useMascotContext } from "@/context/MascotContext";
import { Sparkles, X, RefreshCw, Sun, CloudRain, ShieldAlert } from "lucide-react";

/**
 * Mascot Weather Animation Canvas inside the square frame
 * Renders rain streaks or sunny glow particles based on current mood
 */
function MascotWeatherCanvas({ mood }: { mood: "sunny" | "rain" | "flood" }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", onResize);

    // Particle setup
    const isRain = mood === "rain" || mood === "flood";
    const particleCount = mood === "flood" ? 45 : isRain ? 25 : 12;

    interface Particle {
      x: number;
      y: number;
      speedY: number;
      speedX: number;
      length: number;
      radius: number;
      opacity: number;
    }

    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      speedY: isRain ? (mood === "flood" ? 6 + Math.random() * 5 : 4 + Math.random() * 3) : 0.3 + Math.random() * 0.4,
      speedX: isRain ? (mood === "flood" ? -1.5 : -0.8) : (Math.random() - 0.5) * 0.5,
      length: isRain ? (mood === "flood" ? 14 + Math.random() * 10 : 8 + Math.random() * 6) : 0,
      radius: isRain ? 0 : 2 + Math.random() * 3,
      opacity: 0.3 + Math.random() * 0.5,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      if (isRain) {
        // Draw falling rain streaks
        ctx.strokeStyle = mood === "flood" ? "rgba(147, 197, 253, 0.7)" : "rgba(186, 230, 253, 0.55)";
        ctx.lineWidth = mood === "flood" ? 1.8 : 1.2;
        ctx.lineCap = "round";

        particles.forEach((p) => {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.speedX * 3, p.y + p.length);
          ctx.stroke();

          p.y += p.speedY;
          p.x += p.speedX;

          if (p.y > height) {
            p.y = -p.length;
            p.x = Math.random() * width;
          }
          if (p.x < 0) {
            p.x = width;
          }
        });

        // Bottom wave / water shimmer
        const gradient = ctx.createLinearGradient(0, height - 16, 0, height);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(
          1,
          mood === "flood" ? "rgba(30, 58, 138, 0.6)" : "rgba(14, 116, 144, 0.35)"
        );
        ctx.fillStyle = gradient;
        ctx.fillRect(0, height - 16, width, 16);
      } else {
        // Sunny warm ambient glow particles
        particles.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(253, 224, 71, ${p.opacity * 0.4})`;
          ctx.fill();

          p.y -= p.speedY;
          p.x += p.speedX;

          if (p.y < 0) {
            p.y = height;
            p.x = Math.random() * width;
          }
        });
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, [mood]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-0" />;
}

export default function MascotWidget() {
  const {
    mascotType,
    toggleMascotType,
    mascotMood,
    currentQuote,
    cycleNextQuote,
    getMascotImage,
    isSpeechBubbleOpen,
    setIsSpeechBubbleOpen,
  } = useMascotContext();

  const imgSrc = getMascotImage();

  // Background gradient class based on mood
  const moodGradientClass =
    mascotMood === "flood"
      ? "from-slate-900 via-indigo-950/80 to-blue-950/90 border-rose-500/40 shadow-rose-900/30"
      : mascotMood === "rain"
      ? "from-slate-900 via-sky-950/80 to-cyan-950/80 border-sky-400/40 shadow-sky-950/40"
      : "from-amber-950/30 via-slate-900/90 to-blue-950/60 border-amber-400/30 shadow-amber-900/20";

  return (
    <div className="absolute bottom-6 left-4 z-[990] flex flex-col items-start gap-2.5 select-none pointer-events-auto">
      {/* 1. DUOLINGO-STYLE SPEECH BUBBLE */}
      {isSpeechBubbleOpen && (
        <div className="relative max-w-[270px] sm:max-w-[320px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-2xl animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className="flex items-start justify-between gap-1.5 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">
                {mascotType === "duck" ? "🦆 Bé Vịt" : "🐱 Bé Mèo"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-blue-500/15 text-blue-500 dark:text-blue-400">
                {mascotMood === "flood" ? "🚨 Cảnh báo" : mascotMood === "rain" ? "🌧️ Mưa" : "☀️ Nắng ráo"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={cycleNextQuote}
                title="Đổi câu nói khác"
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                onClick={() => setIsSpeechBubbleOpen(false)}
                title="Đóng bóng thoại"
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          <p
            onClick={cycleNextQuote}
            className="text-xs sm:text-[13px] leading-relaxed font-semibold text-slate-800 dark:text-slate-100 cursor-pointer hover:opacity-85 transition"
          >
            &ldquo;{currentQuote}&rdquo;
          </p>

          {/* Speech Bubble Arrow pointing down to Mascot */}
          <div className="absolute -bottom-2 left-8 w-4 h-4 bg-white/95 dark:bg-slate-900/95 border-r border-b border-slate-200 dark:border-slate-800 transform rotate-45" />
        </div>
      )}

      {/* 2. SQUARE FRAMED MASCOT CONTAINER WITH WEATHER BACKGROUND */}
      <div className="relative group">
        <div
          onClick={cycleNextQuote}
          className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-gradient-to-b ${moodGradientClass} border backdrop-blur-xl shadow-2xl overflow-hidden cursor-pointer transition-all duration-300 transform group-hover:scale-105 active:scale-95`}
        >
          {/* Animated Weather Canvas (Rain / Sun particles) */}
          <MascotWeatherCanvas mood={mascotMood} />

          {/* Character Image */}
          <div className="relative z-10 w-full h-full p-2 flex items-center justify-center">
            <img
              src={imgSrc}
              alt={mascotType === "duck" ? "Bé Vịt" : "Bé Mèo"}
              className="w-full h-full object-contain filter drop-shadow-lg transition-transform duration-300 group-hover:-translate-y-1"
            />
          </div>

          {/* Weather Status Icon Badge (Top-Left) */}
          <div className="absolute top-2 left-2 z-20 p-1 rounded-xl bg-black/40 backdrop-blur-md text-white border border-white/10 shadow">
            {mascotMood === "flood" ? (
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            ) : mascotMood === "rain" ? (
              <CloudRain className="w-3.5 h-3.5 text-cyan-300" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-300" />
            )}
          </div>
        </div>

        {/* 3. SWITCH BUTTON (DUCK <-> CAT TOGGLE) (Top-Right of Frame) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMascotType();
          }}
          title={mascotType === "duck" ? "Đổi sang Bé Mèo 🐱" : "Đổi sang Bé Vịt 🦆"}
          className="absolute -top-2 -right-2 z-30 px-2 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:scale-110 active:scale-95 transition cursor-pointer"
        >
          <span>{mascotType === "duck" ? "🦆" : "🐱"}</span>
          <span className="text-[10px] text-blue-500 font-semibold uppercase">Đổi</span>
        </button>
      </div>
    </div>
  );
}
