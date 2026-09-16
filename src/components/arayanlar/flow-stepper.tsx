"use client";

import { FLOW_STEPS, flowStepStatus, type FlowStepId } from "@/lib/arayanlar/presentation";

export function ArayanlarFlowStepper({ current }: { current: FlowStepId }) {
  return (
    <nav aria-label="Başvuru aşamaları" className="w-full">
      {/* Desktop / wide */}
      <ol className="hidden gap-2 sm:flex sm:flex-wrap">
        {FLOW_STEPS.map((step) => {
          const status = flowStepStatus(step.id, current);
          return (
            <li
              key={step.id}
              aria-current={status === "current" ? "step" : undefined}
              className={
                status === "current"
                  ? "rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
                  : status === "complete"
                    ? "rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--ink)]"
                    : "rounded-md border border-dashed border-[var(--line)] px-3 py-1.5 text-sm text-[var(--muted)]"
              }
            >
              <span aria-hidden="true" className="mr-1.5">
                {status === "complete" ? "✓" : status === "current" ? "●" : "○"}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>

      {/* Compact mobile */}
      <p className="text-sm text-[var(--muted)] sm:hidden" aria-live="polite">
        Adım {FLOW_STEPS.findIndex((s) => s.id === current) + 1}/{FLOW_STEPS.length}:{" "}
        <strong className="text-[var(--ink)]">
          {FLOW_STEPS.find((s) => s.id === current)?.label}
        </strong>
      </p>
      <ol className="mt-2 flex gap-1 sm:hidden" aria-hidden="true">
        {FLOW_STEPS.map((step) => {
          const status = flowStepStatus(step.id, current);
          return (
            <li
              key={step.id}
              className={
                status === "current"
                  ? "h-1.5 flex-1 rounded-full bg-[var(--accent)]"
                  : status === "complete"
                    ? "h-1.5 flex-1 rounded-full bg-[color-mix(in_oklab,var(--accent)_45%,var(--line))]"
                    : "h-1.5 flex-1 rounded-full bg-[var(--line)]"
              }
              title={step.label}
            />
          );
        })}
      </ol>
    </nav>
  );
}
