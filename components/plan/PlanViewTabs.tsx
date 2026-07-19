"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type PlanViewTabsProps = {
  generate: ReactNode;
  saved: ReactNode;
};

export function PlanViewTabs({ generate, saved }: PlanViewTabsProps) {
  const [activeTab, setActiveTab] = useState<"generate" | "saved">("generate");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  function selectTab(index: number) {
    setActiveTab(index === 0 ? "generate" : "saved");
    tabs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      selectTab((index + 1) % 2);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      selectTab((index + 1) % 2);
    }
  }

  return (
    <div className="plan-views">
      <div className="plan-tabs" role="tablist" aria-label="Vistas de dieta">
        <button
          ref={(element) => {
            tabs.current[0] = element;
          }}
          className="plan-tabs__tab"
          type="button"
          role="tab"
          id="plan-generate-tab"
          aria-selected={activeTab === "generate"}
          aria-controls="plan-generate-panel"
          tabIndex={activeTab === "generate" ? 0 : -1}
          onClick={() => setActiveTab("generate")}
          onKeyDown={(event) => onKeyDown(event, 0)}
        >
          Generar
        </button>
        <button
          ref={(element) => {
            tabs.current[1] = element;
          }}
          className="plan-tabs__tab"
          type="button"
          role="tab"
          id="plan-saved-tab"
          aria-selected={activeTab === "saved"}
          aria-controls="plan-saved-panel"
          tabIndex={activeTab === "saved" ? 0 : -1}
          onClick={() => setActiveTab("saved")}
          onKeyDown={(event) => onKeyDown(event, 1)}
        >
          Guardados
        </button>
      </div>
      <div
        id="plan-generate-panel"
        role="tabpanel"
        aria-labelledby="plan-generate-tab"
        hidden={activeTab !== "generate"}
      >
        {generate}
      </div>
      <div
        id="plan-saved-panel"
        role="tabpanel"
        aria-labelledby="plan-saved-tab"
        hidden={activeTab !== "saved"}
      >
        {saved}
      </div>
    </div>
  );
}
