import { MODULE_LAYERS } from "../settings/boundary-module-layers.mjs";

/**
 * 아키텍처 경계 — 각 레이어 type ↔ 경로 매핑.
 * 레이어별 책임·파일 종류는 `baseLayerSemantics` 참조.
 */
export const baseBoundaryElements = [
  ...MODULE_LAYERS,
  // common/infrastructure*는 허용 하위 폴더만 명시 — no-unknown-files가 그 외 경로를 거부
  // common-pure를 별도 element로 분리 — framework-free 폴더만 묶어 model 포함 모든 레이어에서 import 허용
  // 새 pure 폴더(utils/events/interfaces 등) 추가 시 pattern 배열에 append만
  { type: "common-pure", pattern: ["src/common/constants/**"] },
  {
    type: "common",
    pattern: [
      "src/common/authentication/**",
      "src/common/guards/**",
      "src/common/exceptions/**",
      "src/common/interfaces/**",
      "src/common/middlewares/**",
      "src/common/pipes/**",
      "src/common/interceptors/**",
      "src/common/decorators/**",
      "src/common/events/**",
      "src/common/dtos/**",
      "src/common/config/**",
      "src/common/utils/**",
    ],
  }, // 전역 공용 (허용 하위 폴더만)
  // 인프라는 외부 시스템 I/O 여부로 나눈다 — I/O 없는 실행 환경 기능은 shared(어느 레이어든), I/O는 Port 뒤 provider 전용
  {
    type: "infrastructure-shared",
    pattern: [
      "src/infrastructure/logger/**",
      "src/infrastructure/metrics/**",
      "src/infrastructure/transaction/**",
    ],
  }, // I/O 없는 실행 환경 기능 — service 포함 어느 레이어든 사용
  {
    type: "infrastructure",
    pattern: [
      "src/infrastructure/database/**",
      "src/infrastructure/i18n/**",
      "src/infrastructure/cache/**",
      "src/infrastructure/email/**",
      "src/infrastructure/external/**",
    ],
  }, // 외부 시스템 I/O — provider(Port 구현체)에서만 사용
  { type: "libs", pattern: ["src/libs/**"] }, // 독립 라이브러리
];
