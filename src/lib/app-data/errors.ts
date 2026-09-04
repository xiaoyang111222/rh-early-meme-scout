import type { CallToolResult } from "./types.ts";
import { isLoginRequired } from "./login.ts";

export type CallToolErrorKind =
  | "login"
  | "not_connected"
  | "scope_denied"
  | "access_denied"
  | "error";

export type CallToolErrorState = {
  kind: CallToolErrorKind;
  message: string;
  detail?: string;
};

export function classifyCallToolError(
  result: CallToolResult,
): CallToolErrorState | null {
  if (result.ok) return null;
  const detail = result.errorMessage || undefined;
  const raw = (result.errorMessage ?? "").toLowerCase();
  if (isLoginRequired(result)) {
    return {
      kind: "login",
      message: "Continue with Grok to load your data.",
      detail,
    };
  }
  if (raw.includes("not_connected") || raw.includes("failed_precondition")) {
    return {
      kind: "not_connected",
      message: "Connect this connector in Grok to load your data.",
      detail,
    };
  }
  if (raw.includes("scope_denied")) {
    return {
      kind: "scope_denied",
      message: "This view isn't available — the app requested a tool outside its grant.",
      detail,
    };
  }
  if (raw.includes("access_denied")) {
    return {
      kind: "access_denied",
      message: "You don't have access to this data.",
      detail,
    };
  }
  return {
    kind: "error",
    message: detail ?? "Something went wrong. Try again.",
    detail,
  };
}
