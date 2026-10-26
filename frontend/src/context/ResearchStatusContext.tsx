import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ResearchMode =
  | "idle"
  | "researching"
  | "searching"
  | "generating"
  | "success"
  | "no-evidence"
  | "error";

export interface ResearchStatusState {
  mode: ResearchMode;
  detail: string;
  lastQuestion: string | null;
}

interface ResearchStatusContextValue {
  status: ResearchStatusState;
  setStatus: (next: ResearchStatusState) => void;
  hydeEnabled: boolean;
  setHydeEnabled: (enabled: boolean) => void;
}

const defaultStatus: ResearchStatusState = {
  mode: "idle",
  detail: "Ready to research.",
  lastQuestion: null,
};

const ResearchStatusContext = createContext<ResearchStatusContextValue | undefined>(undefined);

export function ResearchStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatusState] = useState<ResearchStatusState>(defaultStatus);
  const [hydeEnabled, setHydeEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("docuquery-hyde-enabled") !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem("docuquery-hyde-enabled", String(hydeEnabled));
  }, [hydeEnabled]);

  const value = useMemo(
    () => ({
      status,
      setStatus: setStatusState,
      hydeEnabled,
      setHydeEnabled,
    }),
    [status, hydeEnabled]
  );

  return <ResearchStatusContext.Provider value={value}>{children}</ResearchStatusContext.Provider>;
}

export function useResearchStatus() {
  const context = useContext(ResearchStatusContext);

  if (!context) {
    throw new Error("useResearchStatus must be used within a ResearchStatusProvider");
  }

  return context;
}
