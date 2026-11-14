---
name: typeorm-migration
description: "TypeORM 마이그레이션 SQL 파일 생성. NestJS + TypeORM 프로젝트에서 ORM Entity(`*.orm-entity.ts`) 변경, DB 스키마 변경, 마이그레이션 작성 요청 시 사용. migrations/ 디렉토리에 개발 서버·프로덕션 적용 방법을 나눈 SQL 파일을 만든다."
---

## 목적

`migrations/`에 PostgreSQL 마이그레이션 SQL 파일을 만든다. 파일을 만들기만 하고 DB에 실행하지 않는다.

## 실행 절차

1. 대상 테이블과 변경 내용을 파악한다. `*.orm-entity.ts`에서 대상 Entity의 컬럼·관계·`@Index`·`@JoinColumn`을 읽는다.
2. 환경별 `DB_SYNCHRONIZE` 값만 확인한다. 환경 파일에는 DB 비밀번호 등 비밀값이 있으므로 **파일 전체를 읽지 않는다**:
   ```bash
   grep -H '^DB_SYNCHRONIZE=' .env.local .env.development .env.production 2>/dev/null
   ```
3. 기존 `migrations/*.sql`을 읽어 형식·톤·이름 규칙을 맞춘다. 기존 파일의 규칙이 아래 기본값과 다르면 기존 파일을 따른다.
4. 제약·인덱스 이름을 정한다 (아래 "이름 결정").
5. 파일을 만들고 사용자에게 보여준다.

## 이름 결정

DROP·변경 대상 제약/인덱스의 이름은 **추측하지 않는다**. 이름이 틀리면 프로덕션 마이그레이션이 중간에 실패한다.

1. Entity에 이름이 선언돼 있으면 그대로 쓴다 — `@Index('idx_...')`, `@JoinColumn({ foreignKeyConstraintName: '...' })`, `@Unique('...')`.
2. 기존 마이그레이션이 만든 이름이면 그대로 쓴다.
3. 둘 다 아니면 TypeORM 자동 이름(`FK_<hash>`, `IDX_<hash>`)일 수 있다. SQL에 `-- TODO: 실제 이름 확인 (\d <테이블>)` 주석을 남기고 사용자에게 알린다.

새로 만드는 이름의 기본 규칙:

- 인덱스: `idx_{테이블}_{컬럼1}_{컬럼2}`
- FK: `fk_{테이블}_{대상테이블}_{컬럼}`

새 이름은 Entity에도 같은 이름을 선언하도록 사용자에게 안내한다. 그래야 `DB_SYNCHRONIZE=true`인 환경에서도 이름이 일치한다.

## 파일명

```
YYYYMMDD-{entity-kebab-case}-{변경-kebab-case}.sql
```

날짜는 오늘. 예: `20260317-user-soft-delete.sql`, `20260322-order-add-total-price.sql`.

## 파일 형식

```sql
-- {EntityName} {변경 설명} 마이그레이션
--
-- ============================================================
-- 개발 서버 (DB_SYNCHRONIZE=true)
-- ============================================================
-- {데이터 변환 없음: "앱 재시작만 하면 TypeORM이 자동 처리:" + 자동 처리 항목}
-- {데이터 변환 있음: "앱 재시작 전에 아래 SQL을 먼저 실행한다." + 변환 SQL}
--
-- ============================================================
-- 프로덕션 (DB_SYNCHRONIZE=false)
-- ============================================================
-- 실행 시점: 코드 배포 전
-- 실행 전 반드시 DB 백업

BEGIN;

-- 1. {설명}
{SQL}

COMMIT;
```

- 모든 환경이 `DB_SYNCHRONIZE=false`이면 개발 서버 섹션에도 전체 SQL을 쓴다.
- 데이터 변환(UPDATE·컬럼 이동)이 있으면 개발 서버에서도 synchronize가 데이터를 옮겨 주지 않으므로 변환 SQL을 개발 서버 섹션에 넣는다. synchronize가 컬럼을 먼저 지우면 데이터가 사라지니 "재시작 전 실행"을 명시한다.
- 프로덕션 SQL은 `BEGIN`/`COMMIT`으로 감싼다. 단 `ALTER TYPE ... ADD VALUE`는 트랜잭션 안에서 실행할 수 없으므로 블록 밖에 둔다.
- 단계마다 `-- {번호}. {설명}` 주석, SQL 문 사이 빈 줄.

## SQL 규칙

- Date 컬럼은 `TIMESTAMPTZ` (lint `local/require-timestamptz`와 일치).
- nullable 컬럼은 `DEFAULT NULL` 명시.
- 테이블 생성 기본형:
  ```sql
  CREATE TABLE {테이블} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ...,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
- `DROP TABLE`·`DROP COLUMN`처럼 데이터가 사라지는 문은 파일 상단 설명에 무엇이 사라지는지 적는다. `CASCADE`는 사용자가 의도를 확인한 경우에만 붙인다.
- NOT NULL 컬럼을 기존 테이블에 추가할 때는 `DEFAULT`를 주거나, nullable로 추가 → UPDATE로 채움 → `SET NOT NULL` 순서로 쓴다.
- ENUM 값 변경·삭제는 재생성: `RENAME TO {이름}_old` → 새 `CREATE TYPE` → `ALTER COLUMN ... TYPE ... USING {컬럼}::text::{이름}` → `DROP TYPE {이름}_old`.
- Soft delete: `deleted_at TIMESTAMPTZ DEFAULT NULL` 추가, 조회용 복합 인덱스에 `deleted_at` 포함, FK `ON DELETE CASCADE` → `NO ACTION` 검토.
