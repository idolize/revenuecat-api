# Changelog

All notable changes to this project will be documented in this file.

## 2.0.0

### Breaking Changes

- Removed built-in rate limiting. The `automaticRateLimit` client option and `createRateLimitMiddleware` middleware have been removed. Handle `429` responses and `Retry-After` headers in your application if needed (see [RevenueCat rate limit docs](https://www.revenuecat.com/docs/api-v2#tag/Rate-Limit)).
- `CreateRevenueCatClientOptions` is now an alias for `openapi-fetch`'s `ClientOptions` (no library-specific options remain).

### Added

- Regenerated types from the latest RevenueCat OpenAPI spec, including new endpoints for:
  - Audit logs
  - Collaborators
  - Virtual currencies
  - Webhook integrations
  - Media assets
  - Charts & metrics
  - Customer actions (grant/revoke entitlement, assign offering, restore purchase)
  - Archive/unarchive actions for entitlements, offerings, products, and virtual currencies
  - Subscription extend action
  - Revenue metrics

### Changed

- Updated `openapi-fetch` from `^0.15.0` to `^0.17.0`.
