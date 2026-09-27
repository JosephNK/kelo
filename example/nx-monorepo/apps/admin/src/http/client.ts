// GENERATED CODE - DO NOT MODIFY BY HAND
// Source: jkit nextjs-openapi-gen

import ky, { type Hooks, type KyInstance, type Options } from "ky";

const API_PROXY_PATH = "/api/proxy";

// 재시도는 ky(transport) 레이어에 일원화한다. ky는 SSR·route handler·브라우저 등
// 모든 호출부를 덮으므로 단일 권위로 두기 적합하다. TanStack Query를 쓰면 RQ의 기본
// 재시도(3회)와 곱해져 요청이 폭증하므로, QueryClient에서 `retry: false`로 끈다.
const DEFAULT_RETRY: Options["retry"] = {
  limit: 2,
  methods: ["get"],
  statusCodes: [408, 429, 500, 502, 503, 504],
};

// 앱별로 다르게 주입하는 설정. 모노레포에서 공유 패키지를 쓸 때 apps/a·apps/b가
// 각자 apiUrl·proxyPath·hooks(인증·401 refresh·인터셉터)를 넘겨 동일 service를
// 서로 다른 설정으로 공유한다.
export interface ApiClientConfig {
  apiUrl?: string; // 서버사이드 base URL (브라우저는 proxyPath를 거치므로 무시)
  proxyPath?: string; // 브라우저 프록시 경로 (기본 `/api/proxy`)
  hooks?: Hooks; // ky hooks — 인증 헤더·401 refresh·인터셉터
  retry?: Options["retry"]; // 기본 override
  timeout?: Options["timeout"];
  headers?: Record<string, string>;
}

// 브라우저는 proxyPath를 거치므로 apiUrl을 무시하고, 서버(SSR·route handler)에서만
// apiUrl로 백엔드에 직통한다.
function getPrefix(apiUrl: string, proxyPath: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${proxyPath}`;
  }

  if (!apiUrl) {
    throw new Error("server-side API base URL is required");
  }
  return apiUrl;
}

// config를 주입받아 KyInstance를 만든다. 멀티 앱은 각 앱이 자기 config로 호출한다.
export function createApiClient(config: ApiClientConfig = {}): KyInstance {
  return ky.create({
    prefix: getPrefix(config.apiUrl ?? "", config.proxyPath ?? API_PROXY_PATH),
    retry: config.retry ?? DEFAULT_RETRY,
    timeout: config.timeout ?? 30_000,
    headers: { Accept: "application/json", ...config.headers },
    hooks: config.hooks,
  });
}

// 단일 앱 편의용 싱글톤. 최초 1회 config로 초기화되고 이후 동일 인스턴스를 반환한다.
// 멀티 앱이면 각 앱이 createApiClient(config)로 자기 인스턴스를 만들어 쓰는 걸 권장.
let api: KyInstance | null = null;

export function getApi(config?: ApiClientConfig): KyInstance {
  if (api === null) {
    api = createApiClient(config);
  }
  return api;
}

export function resetApiInstance(): void {
  api = null;
}
