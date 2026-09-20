import type { Finish } from "@mooligan/domain/catalog";
import { useReducedMotionConfig } from "motion/react";

import "./foil-overlay.css";

/** Place above artwork in a positioned, isolated frame, before badges or controls. */
export function FoilOverlay({ finish }: { finish?: Finish }) {
  const reduceMotion = useReducedMotionConfig() ?? false;
  if (finish !== "foil" && finish !== "etched") return null;

  return (
    <span
      aria-hidden="true"
      className="foil-overlay"
      data-animated={!reduceMotion}
      data-finish={finish}
    />
  );
}
