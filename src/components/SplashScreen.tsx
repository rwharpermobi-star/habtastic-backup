import { useEffect, useState } from "react";

interface SplashScreenProps {
  show: boolean;
}

/**
 * Cold-start splash. Deliberately CSS-only: this is the very first component
 * mounted, so importing framer-motion here dragged ~129 kB of animation
 * runtime into the eager startup graph for animations that plain keyframes
 * express perfectly well. Every other consumer of framer-motion sits behind a
 * lazy route, so keeping this file dependency-free keeps the library off the
 * critical path entirely.
 */
const EXIT_MS = 500;

const SplashScreen = ({ show }: SplashScreenProps) => {
  // Mirror AnimatePresence: stay mounted for the fade-out, then unmount.
  const [mounted, setMounted] = useState(show);

  useEffect(() => {
    if (show) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [show, mounted]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center splash-root"
      style={{
        background: "linear-gradient(135deg, #0077FF 0%, #4DA3FF 50%, #EF4444 100%)",
        opacity: show ? 1 : 0,
        transition: `opacity ${EXIT_MS}ms ease-in-out`,
      }}
      aria-hidden={!show}
    >
      <img
        src="/icons/icon-192.png?v=3"
        width={96}
        height={96}
        alt="HabTastic AI"
        className="w-24 h-24 rounded-3xl shadow-lg splash-logo"
      />

      <h1
        className="mt-5 text-3xl font-bold font-display text-white splash-title"
        style={{ textShadow: "0 0 30px rgba(255,255,255,0.3)" }}
      >
        HabTastic AI ⚡
      </h1>

      <p className="mt-2 text-sm text-white/80 font-medium splash-tagline">
        Let's crush it together 🚀
      </p>

      <div className="flex gap-1.5 mt-8">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-white splash-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
};

export default SplashScreen;
