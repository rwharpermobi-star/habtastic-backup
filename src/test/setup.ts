import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("@/integrations/supabase/backendConfig", async (importOriginal) => {
  const config = await importOriginal<typeof import("@/integrations/supabase/backendConfig")>();
  return {
    ...config,
    activeBackend: config.activeBackend.available ? config.activeBackend : {
      ...config.activeBackend,
      url: "http://127.0.0.1:54321",
      publishableKey: "unit-test-key",
      available: true,
    },
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
