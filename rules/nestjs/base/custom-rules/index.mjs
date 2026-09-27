// =============================================================================
// Kelo NestJS — Custom ESLint Plugin
// -----------------------------------------------------------------------------

import requireApiProperty from "./require-api-property.mjs";
import dtoNamingConvention from "./dto-naming-convention.mjs";
import requireTimestamptz from "./require-timestamptz.mjs";
import requireMapDomainException from "./require-map-domain-exception.mjs";
import dtoUnionTypeRestriction from "./dto-union-type-restriction.mjs";
import noDtoOneof from "./no-dto-oneof.mjs";
import dtoNullableMatch from "./dto-nullable-match.mjs";
import enforceFileSuffix from "./enforce-file-suffix.mjs";
import noNestedLayerDir from "./no-nested-layer-dir.mjs";
import noUnknownDomainFolder from "./no-unknown-domain-folder.mjs";
import noEntityReturn from "./no-entity-return.mjs";

/** @type {import('eslint').ESLint.Plugin} */
export default {
  rules: {
    "require-api-property": requireApiProperty,
    "dto-naming-convention": dtoNamingConvention,
    "require-timestamptz": requireTimestamptz,
    "require-map-domain-exception": requireMapDomainException,
    "dto-union-type-restriction": dtoUnionTypeRestriction,
    "no-dto-oneof": noDtoOneof,
    "dto-nullable-match": dtoNullableMatch,
    "enforce-file-suffix": enforceFileSuffix,
    "no-nested-layer-dir": noNestedLayerDir,
    "no-unknown-domain-folder": noUnknownDomainFolder,
    "no-entity-return": noEntityReturn,
  },
};
