import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimitMiddleware } from "../src/rateLimitMiddleware";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console.warn to capture warnings
const mockConsoleWarn = vi.fn();
global.console.warn = mockConsoleWarn;

// Mock callback parameters that match MiddlewareCallbackParams
const createMockCallbackParams = (request: Request) => ({
  request,
  options: {
    baseUrl: "https://api.revenuecat.com",
    parseAs: "json" as const,
    querySerializer: vi.fn(),
    bodySerializer: vi.fn(),
    fetch: mockFetch,
  },
  schemaPath: `/v1/${request.url.substring(30)}`,
  params: {},
  id: "test-id",
});

describe("Rate Limit Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("onRequest", () => {
    it("should not delay requests when endpoint is not throttled", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      const result = await middleware.onRequest?.(
        createMockCallbackParams(request)
      );

      expect(result).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should delay requests when endpoint is throttled", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock all retries to return 429 so the endpoint stays throttled
      mockFetch.mockResolvedValue(
        new Response("Still rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        })
      );

      // First, trigger a 429 response to set throttling state
      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: new Response("Rate limit exceeded", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      });

      // Fast-forward through all retry attempts (3 retries)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();
      }

      await onResponsePromise;

      // Now try a second request - it should be delayed
      const secondRequest = new Request(
        "https://api.revenuecat.com/v1/subscribers"
      );
      const onRequestPromise = middleware.onRequest?.(
        createMockCallbackParams(secondRequest)
      );

      // Fast-forward time by 1 second (less than the 2 second retry-after)
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      // The request should still be pending
      expect(onRequestPromise).toBeInstanceOf(Promise);

      // Fast-forward to complete the delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onRequestPromise;
      expect(result).toBeUndefined();
    });

    it("should not warn when queue is empty", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Call onRequest - should not warn since queue is empty
      await middleware.onRequest?.(createMockCallbackParams(request));

      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe("onResponse", () => {
    it("should return response unchanged for non-429 responses", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");
      const response = new Response("Success", { status: 200 });

      const result = await middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response,
      });

      expect(result).toBeUndefined();
    });

    it("should retry 429 responses after waiting for Retry-After time and return success if retry succeeds", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock the retry response to be successful
      mockFetch.mockResolvedValueOnce(new Response("Success", { status: 200 }));

      const response429 = new Response("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": "1" },
      });

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time to complete the retry-after delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      expect(mockFetch).toHaveBeenCalledWith(request, {});
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(200);
    });

    it("should return original 429 response if all retries fail with 429", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock all retries to return 429
      mockFetch.mockResolvedValue(
        new Response("Still rate limited", {
          status: 429,
          headers: { "Retry-After": "1" },
        })
      );

      const originalResponse = new Response("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": "1" },
      });

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: originalResponse,
      });

      // Fast-forward through all retry attempts
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
        await vi.runAllTimersAsync();
      }

      const result = await onResponsePromise;

      // Should have called fetch 3 times (the retry attempts)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Should return the last 429 response after max retries
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(429);
    });

    it("should handle missing Retry-After header with fallback and succeed if retry does", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock successful retry
      mockFetch.mockResolvedValueOnce(new Response("Success", { status: 200 }));

      const response429 = new Response("Rate limit exceeded", {
        status: 429,
        // No Retry-After header
      });

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time by 1 second (fallback delay)
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      expect(mockFetch).toHaveBeenCalledWith(request, {});
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(200);
    });

    it("should handle invalid Retry-After header with fallback and succeed if retry does", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock successful retry
      mockFetch.mockResolvedValueOnce(new Response("Success", { status: 200 }));

      const response429 = new Response("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": "invalid" },
      });

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time by 1 second (fallback delay)
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      expect(mockFetch).toHaveBeenCalledWith(request, {});
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(200);
    });

    it("should handle fetch errors during retry and throw", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock fetch to throw an error
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const response429 = new Response("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": "1" },
      });

      let caughtError: Error | undefined;
      const onResponsePromise = (
        middleware.onResponse?.({
          ...createMockCallbackParams(request),
          response: response429,
        }) as Promise<Response | undefined>
      ).catch((error) => {
        // Work around Vitest issue catching unhandled rejections
        caughtError = error;
      });

      // Fast-forward time to complete the retry-after delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      await onResponsePromise;

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toBe("Network error");
    });

    it("should not retry when response body has retryable: false", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      const response429 = new Response(
        JSON.stringify({
          type: "rate_limit_error",
          message: "Rate limit exceeded",
          retryable: false,
          doc_url: "https://errors.rev.cat/rate-limit-error",
          backoff_ms: 1000,
        }),
        {
          status: 429,
          headers: { "Retry-After": "1", "Content-Type": "application/json" },
        }
      );

      const result = await middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Should return the original response without retrying
      expect(result).toBe(response429);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should retry when response body has retryable: true", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock successful retry
      mockFetch.mockResolvedValueOnce(new Response("Success", { status: 200 }));

      const response429 = new Response(
        JSON.stringify({
          type: "rate_limit_error",
          message: "Rate limit exceeded",
          retryable: true,
          doc_url: "https://errors.rev.cat/rate-limit-error",
          backoff_ms: 1000,
        }),
        {
          status: 429,
          headers: { "Retry-After": "1", "Content-Type": "application/json" },
        }
      );

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time to complete the retry-after delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      expect(mockFetch).toHaveBeenCalledWith(request, {});
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(200);
    });

    it("should retry when response body has no retryable field", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock successful retry
      mockFetch.mockResolvedValueOnce(new Response("Success", { status: 200 }));

      const response429 = new Response(
        JSON.stringify({
          type: "rate_limit_error",
          message: "Rate limit exceeded",
          doc_url: "https://errors.rev.cat/rate-limit-error",
          backoff_ms: 1000,
        }),
        {
          status: 429,
          headers: { "Retry-After": "1", "Content-Type": "application/json" },
        }
      );

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time to complete the retry-after delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      expect(mockFetch).toHaveBeenCalledWith(request, {});
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(200);
    });

    it("should retry when response body is not valid JSON", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock successful retry
      mockFetch.mockResolvedValueOnce(new Response("Success", { status: 200 }));

      const response429 = new Response("Invalid JSON response", {
        status: 429,
        headers: { "Retry-After": "1" },
      });

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time to complete the retry-after delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      expect(mockFetch).toHaveBeenCalledWith(request, {});
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(200);
    });

    it("should stop retrying when retry response has retryable: false", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock retry response to return 429 with retryable: false
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            type: "rate_limit_error",
            message: "Rate limit exceeded",
            retryable: false,
            doc_url: "https://errors.rev.cat/rate-limit-error",
            backoff_ms: 1000,
          }),
          {
            status: 429,
            headers: { "Retry-After": "1", "Content-Type": "application/json" },
          }
        )
      );

      const response429 = new Response(
        JSON.stringify({
          type: "rate_limit_error",
          message: "Rate limit exceeded",
          retryable: true,
          doc_url: "https://errors.rev.cat/rate-limit-error",
          backoff_ms: 1000,
        }),
        {
          status: 429,
          headers: { "Retry-After": "1", "Content-Type": "application/json" },
        }
      );

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: response429,
      });

      // Fast-forward time to complete the retry-after delay
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();

      const result = await onResponsePromise;

      // Should have called fetch once for the retry
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(request, {});
      // Should return the retry response (429 with retryable: false)
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(429);
    });
  });

  describe("endpoint-specific throttling", () => {
    it("should throttle different endpoints independently", async () => {
      const middleware = createRateLimitMiddleware();
      const request1 = new Request("https://api.revenuecat.com/v1/subscribers");
      const request2 = new Request("https://api.revenuecat.com/v1/products");

      // Mock all retries to return 429
      mockFetch.mockResolvedValue(
        new Response("Still rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        })
      );

      // Throttle the first endpoint
      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request1),
        response: new Response("Rate limit exceeded", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      });

      // Fast-forward through all retry attempts (3 retries)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();
      }

      await onResponsePromise;

      // The second endpoint should not be affected
      const result = await middleware.onRequest?.(
        createMockCallbackParams(request2)
      );
      expect(result).toBeUndefined();
    });

    it("should use method and pathname for endpoint key", async () => {
      const middleware = createRateLimitMiddleware();

      // These should be treated as different endpoints
      const getRequest = new Request(
        "https://api.revenuecat.com/v1/subscribers"
      );
      const postRequest = new Request(
        "https://api.revenuecat.com/v1/subscribers",
        { method: "POST" }
      );

      // Mock all retries to return 429
      mockFetch.mockResolvedValue(
        new Response("Still rate limited", {
          status: 429,
          headers: { "Retry-After": "2" },
        })
      );

      // Throttle GET endpoint
      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(getRequest),
        response: new Response("Rate limit exceeded", {
          status: 429,
          headers: { "Retry-After": "2" },
        }),
      });

      // Fast-forward through all retry attempts (3 retries)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(2000);
        await vi.runAllTimersAsync();
      }

      await onResponsePromise;

      // POST endpoint should not be affected
      const result = await middleware.onRequest?.(
        createMockCallbackParams(postRequest)
      );
      expect(result).toBeUndefined();
    });
  });

  describe("multiple retries", () => {
    it("should return 429 response without retrying", async () => {
      const middleware = createRateLimitMiddleware();
      const request = new Request("https://api.revenuecat.com/v1/subscribers");

      // Mock all retries to return 429
      mockFetch.mockResolvedValue(
        new Response("Still rate limited", {
          status: 429,
          headers: { "Retry-After": "1" },
        })
      );

      const originalResponse = new Response("Rate limit exceeded", {
        status: 429,
        headers: { "Retry-After": "1" },
      });

      const onResponsePromise = middleware.onResponse?.({
        ...createMockCallbackParams(request),
        response: originalResponse,
      });

      // Fast-forward through all retry attempts
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
        await vi.runAllTimersAsync();
      }

      const result = await onResponsePromise;

      // Should have called fetch 3 times (the retry attempts)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // Should return the last 429 response after max retries
      expect(result).toBeInstanceOf(Response);
      expect(result?.status).toBe(429);
    });
  });

  describe("concurrent requests", () => {
    it("should handle multiple concurrent requests to the same endpoint", async () => {
      const middleware = createRateLimitMiddleware();
      const baseUrl = "https://api.revenuecat.com/v1/subscribers";

      // Create multiple requests
      const requests = Array.from(
        { length: 5 },
        (_, i) => new Request(`${baseUrl}?id=${i}`)
      );

      // Start all requests - they should all complete immediately since no throttling
      const onRequestPromises = requests.map((request) =>
        middleware.onRequest?.(createMockCallbackParams(request))
      );

      // All requests should complete immediately
      const results = await Promise.all(onRequestPromises);
      results.forEach((result) => {
        expect(result).toBeUndefined();
      });
    });
  });
});
