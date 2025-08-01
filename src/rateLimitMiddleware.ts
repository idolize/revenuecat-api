// https://www.revenuecat.com/docs/api-v2#tag/Rate-Limit

import { Middleware } from "openapi-fetch";

/**
The API will return the following headers on all successful requests:

RevenueCat-Rate-Limit-Current-Usage: the number of executed requests for the current rate limiting period, including the current request. The rate limiting period is one minute.
RevenueCat-Rate-Limit-Current-Limit: the limit in requests per minute for this endpoint
If you reach the rate limit, as indicated by a 429 error code, we will also include the following header:

Retry-After: the number of seconds to wait until you can retry this request.
Below is an example of the response body that will be sent when the rate limit is reached. The value of the backoff_ms field corresponds to the `Retry-After`` header but specified in milliseconds.

{
  "type": "rate_limit_error",
  "message": "Rate limit exceeded",
  "retryable": true,
  "doc_url": "https://errors.rev.cat/rate-limit-error",
  "backoff_ms": 1000
}
*/

interface QueuedRequest {
  request: Request;
  options: Record<string, unknown>;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

interface EndpointState {
  isThrottled: boolean;
  retryAfter: number;
  queue: QueuedRequest[];
  lastRetryTime: number;
  processing: boolean;
}

class RateLimitManager {
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  private endpointStates = new Map<string, EndpointState>();
  private readonly maxRetries = 3;
  private readonly maxQueueSize = 100;

  private getEndpointKey(request: Request): string {
    const url = new URL(request.url);
    return `${request.method}:${url.pathname}`;
  }

  private getRetryAfterTime(response: Response): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds;
      }
    }

    // Fallback to 1 second if no valid Retry-After header
    return 1;
  }

  private async isRetryable(response: Response): Promise<boolean> {
    try {
      // Clone the response to avoid consuming the body
      const clonedResponse = response.clone();
      const body = await clonedResponse.json();

      // Check if retryable field exists and is false
      if (typeof body === "object" && body !== null && "retryable" in body) {
        return body.retryable !== false;
      }

      // Default to retryable if no retryable field is present
      return true;
    } catch {
      // If we can't parse the JSON, default to retryable
      return true;
    }
  }

  async waitForThrottle(request: Request): Promise<void> {
    const endpointKey = this.getEndpointKey(request);

    // Initialize endpoint state if it doesn't exist
    if (!this.endpointStates.has(endpointKey)) {
      this.endpointStates.set(endpointKey, {
        isThrottled: false,
        retryAfter: 0,
        queue: [],
        lastRetryTime: 0,
        processing: false,
      });
    }

    const state = this.endpointStates.get(endpointKey)!;

    // If throttled, wait for the retry-after time
    if (state.isThrottled) {
      const now = Date.now();
      const waitTime = state.lastRetryTime + state.retryAfter * 1000 - now;
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
      state.isThrottled = false;
    }
  }

  async handleResponse(
    request: Request,
    response: Response
  ): Promise<Response> {
    if (response.status !== 429) {
      return response;
    }

    // Check if the response indicates it's not retryable
    const shouldRetry = await this.isRetryable(response);
    if (!shouldRetry) {
      // If not retryable, return the original response immediately
      return response;
    }

    const endpointKey = this.getEndpointKey(request);

    // Initialize endpoint state if it doesn't exist
    if (!this.endpointStates.has(endpointKey)) {
      this.endpointStates.set(endpointKey, {
        isThrottled: false,
        retryAfter: 0,
        queue: [],
        lastRetryTime: 0,
        processing: false,
      });
    }

    const state = this.endpointStates.get(endpointKey)!;
    let retryAfter = this.getRetryAfterTime(response);
    state.isThrottled = true;
    state.retryAfter = retryAfter;
    state.lastRetryTime = Date.now();

    let lastResponse = response;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      // Wait for the retry-after time
      await this.delay(retryAfter * 1000);
      try {
        const retryResponse = await fetch(request, {});
        if (retryResponse.status !== 429) {
          // Success, clear throttled state and return
          state.isThrottled = false;
          return retryResponse;
        }

        // Check if the retry response is also not retryable
        const shouldRetryAgain = await this.isRetryable(retryResponse);
        if (!shouldRetryAgain) {
          // If not retryable, return the response immediately
          state.isThrottled = false;
          return retryResponse;
        }

        // If still 429, update retryAfter for next attempt
        retryAfter = this.getRetryAfterTime(retryResponse);
        state.retryAfter = retryAfter;
        state.lastRetryTime = Date.now();
        lastResponse = retryResponse;
      } catch (error) {
        // If fetch fails, throw the error
        state.isThrottled = false;
        throw error;
      }
    }
    // All retries exhausted, return the last 429 response
    state.isThrottled = false;
    return lastResponse;
  }

  getQueueSize(request: Request): number {
    const endpointKey = this.getEndpointKey(request);
    const state = this.endpointStates.get(endpointKey);
    return state?.queue.length || 0;
  }

  warnIfQueueTooLarge(request: Request): void {
    const queueSize = this.getQueueSize(request);
    if (queueSize >= this.maxQueueSize) {
      const endpointKey = this.getEndpointKey(request);
      console.warn(
        `[RevenueCat API] Rate limit queue for ${endpointKey} has reached maximum size of ${this.maxQueueSize}. Consider implementing additional throttling.`
      );
    }
  }
}

export const createRateLimitMiddleware = (): Middleware => {
  const rateLimitManager = new RateLimitManager();

  return {
    async onRequest({ request }) {
      // Wait if the endpoint is currently throttled
      await rateLimitManager.waitForThrottle(request);

      // Warn if queue is getting too large
      rateLimitManager.warnIfQueueTooLarge(request);

      // Don't return anything - let the request proceed normally
      return undefined;
    },
    async onResponse({ request, response }) {
      // Handle 429 responses with retry logic
      if (response.status === 429) {
        return await rateLimitManager.handleResponse(request, response);
      }

      return undefined;
    },
  };
};
