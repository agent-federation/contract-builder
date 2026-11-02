import { domainHash } from "./digest.js";
import { jcsBytes } from "./json.js";
import { VERIFIER_ID, VERIFIER_VERSION } from "./types.js";

/**
 * The verifier's own checker closure. The value is a published constant: the
 * checker identity is verifier-local and is excluded from cross-implementation
 * comparison (RFC §13.6). It is fixed for a release and changes only when the
 * checker implementation is released.
 */
export const IMPLEMENTATION_DIGEST =
  "sha256:fc9478c781922d37458efc7f2aef8e5fcb4d38d3e74a94778790a6db40a5081e";

export function checkerIdentity(): string {
  return domainHash(
    "pap.checker.identity.v1",
    jcsBytes({
      id: VERIFIER_ID,
      version: VERIFIER_VERSION,
      implementationDigest: IMPLEMENTATION_DIGEST,
    }),
  );
}

export const CHECKER = {
  id: VERIFIER_ID,
  version: VERIFIER_VERSION,
  implementationDigest: IMPLEMENTATION_DIGEST,
} as const;
