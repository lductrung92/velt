// Public entry point for the ai module (architecture.md: cross-module code
// imports only via this file).
// The settings screen owns the assistant's tab: it renders these three panels
// beside the generic fields, and runs the connection test.
export { AiStatusStrip } from "./components/AiStatusStrip";
export { UsagePanel } from "./components/UsagePanel";
export { McpTokensPanel } from "./components/McpTokensPanel";
export { useAiStatus, useAiUsage, useTestAi } from "./hooks/useAi";
export type { TestResult } from "./services/ai.service";
