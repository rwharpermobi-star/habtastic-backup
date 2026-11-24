import { useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { playNavigate } from "@/lib/sfx";

const NAV_ORDER = ["/", "/habits", "/progress", "/pricing", "/profile"];
const SWIPE_THRESHOLD = 50;
const SWIPE_MAX_Y = 100;

export function useSwipeNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleSwipe = useCallback(
    (deltaX: number) => {
      const currentIndex = NAV_ORDER.indexOf(location.pathname);
      if (currentIndex === -1) return;

      let nextIndex: number;
      if (deltaX < -SWIPE_THRESHOLD) {
        // Swipe left → next tab
        nextIndex = currentIndex + 1;
      } else if (deltaX > SWIPE_THRESHOLD) {
        // Swipe right → previous tab
        nextIndex = currentIndex - 1;
      } else {
        return;
      }

      if (nextIndex >= 0 && nextIndex < NAV_ORDER.length) {
        playNavigate();
        navigate(NAV_ORDER[nextIndex]);
      }
    },
    [location.pathname, navigate]
  );

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touchStart.current.x - touch.clientX;
      const deltaY = Math.abs(touchStart.current.y - touch.clientY);
      touchStart.current = null;

      // Only trigger if horizontal swipe is dominant
      if (deltaY < SWIPE_MAX_Y) {
        handleSwipe(deltaX);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [handleSwipe]);
}
