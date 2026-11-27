/**
 * Пропускът за ревизия живее в `../_shared/review-grant.ts`, за да може да се
 * ИЗДАВА и от функциите за генериране (те деплойват само `_shared`).
 * Тук остава само препращане, за да не се дублира логика.
 */
export {
  canonicalGrant,
  cancelReviewOperation,
  commitReviewOperation,
  reserveReviewOperation,
  issueGrantForGeneratedContent,
  issueReviewGrant,
  normalizeReviewContent,
  REVIEW_CONTENT_DIGEST_VERSION,
  REVIEW_GRANT_AUDIENCE,
  REVIEW_GRANT_TTL_S,
  REVIEW_GRANT_VERSION,
  reviewContentDigest,
  reviewGrantNonceKey,
  reviewGrantSecret,
  verifyReviewGrant,
} from "../_shared/review-grant.ts";
export type {
  GrantFailure,
  GrantVerdict,
  NonceDb,
  ReviewGrantPayload,
  SignedReviewGrant,
} from "../_shared/review-grant.ts";
