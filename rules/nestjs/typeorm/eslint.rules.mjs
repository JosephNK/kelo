// =============================================================================
// Kelo NestJS — TypeORM 스택 규칙
// =============================================================================

/**
 * Framework 차단 — model/port/exception에서 TypeORM 타입(@Entity, Repository 등) 금지.
 * 도메인은 순수 타입 유지, TypeORM 엔티티는 provider/ 에 별도 배치.
 * 사용 가능 위치: provider/ (Port 구현체), infrastructure/ (커넥션).
 */
export const typeormFrameworkBannedPackages = ["typeorm", "typeorm/*"];
