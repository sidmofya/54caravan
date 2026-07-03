import type { CSSProperties } from "react";
import type { ScreenTheme } from "./types";

type ScreenRole = "threshold" | "artifact" | "participation";

export function toCssVars(role: ScreenRole, tokens: ScreenTheme): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    vars[`--route-${role}-${key}`] = value;
  }
  return vars as CSSProperties;
}
