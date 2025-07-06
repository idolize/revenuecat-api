# RevenueCat API Client

A type-safe, isomorphic API client for the RevenueCat v2 REST API.

## Overview

This package provides a lightweight, fully-typed client for interacting with the RevenueCat API. It's generated from the [official RevenueCat OpenAPI specification](https://www.revenuecat.com/docs/api-v2) and built on top of `openapi-typescript` and `openapi-fetch`, offering significantly smaller bundle sizes compared to traditional code generators like `openapi-generator`.

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
const client = await createRevenueCatClient('your-api-key-here');

// Example: Fetch subscribers
// (Note all API endpoint strings are type-safe and discoverable via IntelliSense!)
const { data, error } = await client.GET('/v2/subscribers/{app_user_id}', {
  params: {
    // Parameters are type checked
    path: { app_user_id: 'user123' }
  }
});

// Response data is typed as well
if (error) {
  console.error('Error:', error);
} else {
  console.log('Subscriber data:', data);
}
```

## Rate Limiting

The client automatically handles RevenueCat's rate limiting by:

- Respecting `Retry-After` headers from 429 responses
- Queuing requests when rate limits are hit
- Automatically retrying failed requests (up to 3 times by default)
- Managing per-endpoint rate limit states

You can disable automatic rate limiting if desired:

```typescript
const client = await createRevenueCatClient('your-api-key', {
  automaticRateLimit: false
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
- `baseUrl` (string, default: "<https://api.revenuecat.com/v2>"): API base URL
- All other options from `openapi-fetch` are supported

**Returns:** Promise resolving to a configured API client

## Examples

### Managing Subscriptions

```typescript
// Get subscriber information
const { data: subscriber } = await client.GET('/v2/subscribers/{app_user_id}', {
  params: { path: { app_user_id: 'user123' } }
});

// Grant promotional entitlement
const { data: grant } = await client.POST('/v2/subscribers/{app_user_id}/entitlements/{entitlement_id}/promotional', {
  params: {
    path: {
      app_user_id: 'user123',
      entitlement_id: 'premium'
    }
  },
  body: {
    duration: 'month',
    start_time_ms: Date.now()
  }
});
```

### Handling Errors

```typescript
const { data, error } = await client.GET('/v2/subscribers/{app_user_id}', {
  params: { path: { app_user_id: 'user123' } }
});

if (error) {
  switch (error.status) {
    case 404:
      console.log('Subscriber not found');
      break;
    case 429:
      console.log('Rate limit exceeded');
      break;
    default:
      console.error('API error:', error);
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
