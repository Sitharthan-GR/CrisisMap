import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MobilePanel = "map" | "search" | "feed";

interface MobileNavContextValue {
  panel: MobilePanel;
  setPanel: (panel: MobilePanel) => void;
  feedCount: number;
  setFeedCount: (count: number) => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<MobilePanel>("map");
  const [feedCount, setFeedCount] = useState(0);

  const value = useMemo(
    () => ({
      panel,
      setPanel,
      feedCount,
      setFeedCount,
    }),
    [panel, feedCount],
  );

  return (
    <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    throw new Error("useMobileNav must be used within MobileNavProvider");
  }
  return ctx;
}

export function useOptionalMobileNav(): MobileNavContextValue | null {
  return useContext(MobileNavContext);
}
