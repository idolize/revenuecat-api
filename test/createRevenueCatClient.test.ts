import { afterEach, describe, expect, it, vi } from "vitest";
import { createRevenueCatClient } from "../src/index.js";

const mockFetch = vi.fn<(input: Request) => Promise<Response>>();

const listProjectsResponse = {
  object: "list" as const,
  items: [
    {
      object: "project" as const,
      id: "proj1ab2c3d4",
      name: "Test Project",
      created_at: 1658399423658,
    },
  ],
  next_page: null,
  url: "/v2/projects",
};

describe("createRevenueCatClient", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("throws when accessToken is missing", () => {
    expect(() => createRevenueCatClient("")).toThrow("accessToken is required");
  });

  it("exposes path-based endpoints from the generated OpenAPI spec", () => {
    const client = createRevenueCatClient("secret-token", { fetch: mockFetch });

    expect(client["/projects"]).toBeDefined();
    expect(client["/projects"].GET).toBeTypeOf("function");
    expect(client["/projects"].POST).toBeTypeOf("function");
  });

  it("sends requests to the default base URL with Bearer auth", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(listProjectsResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = createRevenueCatClient("secret-token", { fetch: mockFetch });
    const { data, error } = await client["/projects"].GET();

    expect(error).toBeUndefined();
    expect(data).toEqual(listProjectsResponse);
    expect(mockFetch).toHaveBeenCalledOnce();

    const request = mockFetch.mock.calls[0]![0];
    expect(request.url).toBe("https://api.revenuecat.com/v2/projects");
    expect(request.method).toBe("GET");
    expect(request.headers.get("Authorization")).toBe("Bearer secret-token");
  });

  it("merges custom baseUrl and headers", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(listProjectsResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = createRevenueCatClient("secret-token", {
      fetch: mockFetch,
      baseUrl: "https://custom.example.com/v2",
      headers: { "X-Custom": "value" },
    });

    await client["/projects"].GET();

    const request = mockFetch.mock.calls[0]![0];
    expect(request.url).toBe("https://custom.example.com/v2/projects");
    expect(request.headers.get("Authorization")).toBe("Bearer secret-token");
    expect(request.headers.get("X-Custom")).toBe("value");
  });

  it("returns typed API errors from failed responses", async () => {
    const errorBody = {
      type: "authentication_error",
      message: "Invalid API key",
      doc_url: "https://errors.rev.cat/authentication-error",
    };

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify(errorBody), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const client = createRevenueCatClient("bad-token", { fetch: mockFetch });
    const { data, error } = await client["/projects"].GET();

    expect(data).toBeUndefined();
    expect(error).toEqual(errorBody);
  });
});
