import type { ExtractContext, ExtractResponse } from "../frontend/src/types";

export interface HealthResponse {
  ok: boolean;
  mode?: "model" | "mock" | "offline";
  model?: string | null;
}

export function health(): Promise<HealthResponse>;
export function send(text: string, context: ExtractContext, options?: { useMock?: boolean }): Promise<ExtractResponse>;