// =============================================================================
// Kelo NestJS — Anthropic AI SDK 스택 규칙
//
// Anthropic SDK를 Port 뒤로 격리해 provider 교체 가능성 확보.
// =============================================================================

/** Framework 차단 — model/port/exception에서 Anthropic 타입 노출 금지. */
export const anthropicFrameworkBannedPackages = ["@anthropic-ai/*"];

/** Infra 차단 — service에서 직접 호출 금지, provider Port 구현체에서만 사용. */
export const anthropicInfraBannedPackages = ["@anthropic-ai/*"];
