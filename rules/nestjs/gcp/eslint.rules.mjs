// =============================================================================
// Kelo NestJS — Google Cloud (GCP) 스택 규칙
//
// GCP SDK를 Port 뒤로 격리 — vendor-lock 차단, 클라우드 이관 시 provider만 교체.
// =============================================================================

/** Framework 차단 — 도메인이 특정 클라우드 벤더 타입에 의존 금지. */
export const gcpFrameworkBannedPackages = ["@google-cloud/*"];

/** Infra 차단 — service에서 직접 호출 금지, provider Port 구현체에서만 사용. */
export const gcpInfraBannedPackages = ["@google-cloud/*"];
