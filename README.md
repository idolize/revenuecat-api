# RevenueCat API Client

A type-safe, isomorphic API client for the RevenueCat v2 REST API.

## Overview

This package provides a lightweight, fully-typed client for interacting with the RevenueCat API. It's generated from the [official RevenueCat OpenAPI specification](https://www.revenuecat.com/docs/api-v2) and built on top of [`openapi-typescript`](https://openapi-ts.dev/) and [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/), offering significantly smaller bundle sizes compared to traditional code generators like `openapi-generator`.

## Features

- **Type Safety**: Full TypeScript support with generated types from the official OpenAPI spec
- **Automatic Rate Limiting**: Built-in rate limiting that respects RevenueCat's `Retry-After` headers
- **Isomorphic**: Works in both server-side (Node.js, Deno) and browser environments
- **Lightweight**: Minimal bundle size using modern fetch-based architecture
- **Queue Management**: Intelligent request queuing to handle rate limits gracefully
- **Configurable**: Customizable options for different use cases

## Installation

```bash
pnpm add revenuecat-api
# or
yarn add revenuecat-api
# or
npm install revenuecat-api
```

## Quick Start

```typescript
import { createRevenueCatClient } from 'revenuecat-api';

// Create a client with your RevenueCat API key
const client = createRevenueCatClient('your-api-key-here');

// Example: Fetch subscription information
// (Note all API endpoint strings are type-safe and discoverable via IntelliSense!)
const { data, error } = await client[
  "/projects/{project_id}/customers/{customer_id}/subscriptions"
].GET({
  params: {
    // Request path, query, and body are type checked
    path: {
      project_id: "proj1ab2c3d4",
      customer_id: "19b8de26-77c1-49f1-aa18-019a391603e2",
    },
  },
});

// Response data is typed as well
if (error) {
  console.error(`Error of type ${error.type}:`, error.message);
} else {
  console.log('Subscription data:', data);
}
```

## Rate Limiting

The client can optionally handle RevenueCat's rate limiting by:

- Respecting `Retry-After` headers from 429 responses
- Queuing requests when rate limits are hit
- Automatically retrying failed requests (up to 3 times by default)
- Managing per-endpoint rate limit states

You can opt into automatic rate limiting if desired:

```typescript
const client = createRevenueCatClient('your-api-key', {
  automaticRateLimit: true
});
```

For more details on RevenueCat's rate limiting, see the [official documentation](https://www.revenuecat.com/docs/api-v2#tag/Rate-Limit).

## API Reference

### `createRevenueCatClient(accessToken, options?)`

Creates a new RevenueCat API client instance.

**Parameters:**

- `accessToken` (string, required): Your RevenueCat API key
- `options` (object, optional): Configuration options

**Options:**

- `automaticRateLimit` (boolean, default: true): Enable/disable automatic rate limiting
- `baseUrl` (string, default: `"https://api.revenuecat.com/v2"`): API base URL
- All other [options from `openapi-fetch`](https://openapi-ts.dev/openapi-fetch/api#createclient) are supported

**Returns:** A configured API client

## Examples

### Managing Subscriptions / Entitlements

```typescript
// Get subscriptions information
const { data: subscriptions } = await client[
  "/projects/{project_id}/customers/{customer_id}/subscriptions"
].GET({
  params: {
    path: {
      project_id: "proj1ab2c3d4",
      customer_id: "19b8de26-77c1-49f1-aa18-019a391603e2",
    },
    query: {
      limit: 20,
      starting_after: "ent12354",
    },
  },
});

// Create entitlement
const { data: entitlement } = await client[
  "/projects/{project_id}/entitlements"
].POST({
  params: {
    path: {
      project_id: "proj1ab2c3d4",
    },
  },
  body: {
    lookup_key: "premium",
    display_name: "Premium",
  },
});
```

### Handling Errors

```typescript
const { data, error } = await client[
  "/projects/{project_id}/customers/{customer_id}"
].GET({
  params: {
    path: {
      project_id: "proj1ab2c3d4",
      customer_id: "19b8de26-77c1-49f1-aa18-019a391603e2",
    },
  },
});

if (error) {
  switch (error.type) {
    case "resource_missing":
      console.log("Resource not found");
      break;
    case "rate_limit_error":
      console.log("Rate limit exceeded");
      break;
    default:
      console.log("Unknown error", error.message, error.doc_url);
      break;
  }
}
```

## Development

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Generate types: `pnpm generate:openapi`
4. Run tests: `pnpm test`

### Scripts

- `pnpm generate:openapi` - Generate TypeScript types and client from OpenAPI spec
- `pnpm update:openapi` - Redownload the latest RevenueCat OpenAPI spec and then regenerate the client
- `pnpm test` - Run test suite
- `pnpm test:watch` - Run tests in watch mode
- `pnpm lint` - Run ESLint
- `pnpm types:check` - Check TypeScript types

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
