---
name: typeorm-migration
description: 'TypeORM 마이그레이션 SQL 파일 생성. Entity 변경, DB 스키마 변경, 마이그레이션 작성 요청 시 자동 트리거. migrations/ 디렉토리에 프로젝트 컨벤션에 맞는 SQL 파일을 생성한다.'
origin: Kelo
---

## 목적

`migrations/` 디렉토리에 마이그레이션 SQL 파일을 생성한다.

## 환경 파일

- `.env.local` — 로컬 개발 환경
- `.env.development` — 개발 서버 환경
- `.env.production` — 프로덕션 서버 환경

DB 접속 정보와 `DB_SYNCHRONIZE` 값을 환경 파일에서 읽는다.

## 파일명 규칙

```
YYYYMMDD-{entity-kebab-case}-{변경-kebab-case}.sql
```

날짜는 오늘 날짜를 사용한다.

**예시:**
- Entity `User`에 soft delete 추가 → `20260317-user-soft-delete.sql`
- Entity `Order`에 total_price 컬럼 추가 → `20260322-order-add-total-price.sql`
- Entity `Product`에서 category FK 변경 → `20260401-product-change-category-fk.sql`

## 필수 포맷

환경 파일의 `DB_SYNCHRONIZE` 값을 확인한다. `true`이면 개발 서버에서 TypeORM이 스키마를 자동 동기화하므로, 두 환경의 적용 방법이 달라진다. `DB_SYNCHRONIZE`가 모든 환경에서 `false`이면 개발 서버 섹션에도 전체 SQL을 작성한다.

```sql
-- {EntityName} {변경 설명} 마이그레이션
--
-- ============================================================
-- 개발 서버 (DB_SYNCHRONIZE=true)
-- ============================================================
-- {개발 서버 적용 방법 설명}
-- {데이터 변환이 없으면: "데이터 변환 없음. 앱 재시작만 하면 TypeORM이 자동 처리:"}
-- {데이터 변환이 있으면: "앱 재시작 전에 아래 SQL을 먼저 실행한다."}
--   - {TypeORM이 자동 처리할 항목 나열}
--
-- ============================================================
-- 프로덕션 (DB_SYNCHRONIZE=false)
-- ============================================================
-- 실행 시점: 코드 배포 전
-- 실행 전 반드시 DB 백업

BEGIN;

-- {번호}. {설명}
{SQL 문}

COMMIT;
```

## 컨벤션 규칙

### 공통

- 모든 Date 컬럼은 `TIMESTAMPTZ` 타입 사용
- nullable 컬럼은 `DEFAULT NULL` 명시
- SQL 문 사이에 빈 줄로 구분
- 각 단계에 `-- {번호}. {설명}` 주석 필수
- 프로덕션 SQL은 반드시 `BEGIN` / `COMMIT`으로 트랜잭션 래핑 (단, `ALTER TYPE ADD VALUE`는 트랜잭션 내 실행 불가하므로 트랜잭션 밖에서 실행)

### 인덱스 네이밍

```
idx_{테이블명}_{컬럼1}_{컬럼2}
```

### FK constraint 네이밍

```
fk_{테이블명}_{대상테이블명}_{컬럼명}
```

### 변경 유형별 패턴

#### 테이블 생성

```sql
CREATE TABLE {테이블} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  {컬럼명} {타입} {제약조건},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 테이블 삭제

```sql
DROP TABLE IF EXISTS {테이블} CASCADE;
```

#### 컬럼 추가

```sql
ALTER TABLE {테이블}
  ADD COLUMN {컬럼명} {타입} {제약조건};
```

#### 컬럼 변경/이름변경

```sql
ALTER TABLE {테이블}
  RENAME COLUMN {기존} TO {새이름};

ALTER TABLE {테이블}
  ALTER COLUMN {컬럼} TYPE {새타입};
```

#### 컬럼 삭제

```sql
ALTER TABLE {테이블}
  DROP COLUMN {컬럼명};
```

#### 인덱스 추가/교체

```sql
DROP INDEX IF EXISTS {기존인덱스};
CREATE INDEX idx_{테이블}_{컬럼1}_{컬럼2}
  ON {테이블} ({컬럼1}, {컬럼2});
```

#### FK 변경

```sql
ALTER TABLE {테이블}
  DROP CONSTRAINT fk_{테이블}_{대상테이블}_{컬럼},
  ADD CONSTRAINT fk_{테이블}_{대상테이블}_{컬럼}
    FOREIGN KEY ({컬럼}) REFERENCES {대상테이블}({대상컬럼}) ON DELETE {액션};
```

#### ENUM 타입 추가

```sql
CREATE TYPE {enum_이름} AS ENUM ('{값1}', '{값2}', '{값3}');
```

#### ENUM 값 추가

```sql
ALTER TYPE {enum_이름} ADD VALUE '{새값}';
```

#### ENUM 값 변경/삭제 (재생성 필요)

```sql
ALTER TYPE {enum_이름} RENAME TO {enum_이름}_old;
CREATE TYPE {enum_이름} AS ENUM ('{값1}', '{값2}');
ALTER TABLE {테이블}
  ALTER COLUMN {컬럼} TYPE {enum_이름} USING {컬럼}::text::{enum_이름};
DROP TYPE {enum_이름}_old;
```

#### 데이터 마이그레이션

```sql
UPDATE {테이블}
  SET {새컬럼} = {변환식}
  WHERE {조건};
```

#### Soft Delete

1. `deleted_at TIMESTAMPTZ DEFAULT NULL` 컬럼 추가
2. 기존 데이터 변환이 필요하면 UPDATE 문 포함
3. 조회 최적화를 위한 복합 인덱스 생성 (deleted_at 포함)
4. FK `ON DELETE CASCADE` → `ON DELETE NO ACTION` 변경
5. 불필요해진 기존 컬럼 DROP

### 개발 서버 vs 프로덕션 섹션

- **데이터 변환 없음**: 개발 서버 섹션에 "앱 재시작만 하면 TypeORM이 자동 처리" 안내만 작성. 프로덕션 섹션에만 SQL 작성.
- **데이터 변환 있음**: 개발 서버 섹션에도 변환 SQL 포함. 프로덕션 섹션에는 전체 SQL (컬럼 추가 + 변환 + 인덱스 + 컬럼 제거 등) 작성.

## 실행 절차

1. 대상 테이블과 변경 내용을 파악한다
2. 환경 파일(`.env.local` 또는 `.env.development`)에서 `DB_SYNCHRONIZE` 값을 확인한다
3. 기존 마이그레이션 파일들(`migrations/*.sql`)을 읽어 컨벤션과 톤을 확인한다
4. `*.entity.ts` 파일을 찾아 대상 Entity의 컬럼/FK/인덱스 정보를 파악한다
5. 마이그레이션 SQL 파일을 생성한다
6. 생성된 파일을 사용자에게 보여주고 확인을 받는다

## 참고 파일

- 기존 마이그레이션: `migrations/*.sql`
- DB 접속 정보: `.env.local`, `.env.development`, `.env.production`
- Entity 파일: `*.entity.ts`
