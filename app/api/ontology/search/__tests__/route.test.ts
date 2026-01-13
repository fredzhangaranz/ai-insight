import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const searchOntologyConceptsMock = vi.fn();

vi.mock("@/lib/middleware/auth-middleware", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/services/ontology-search.service", () => ({
  searchOntologyConcepts: searchOntologyConceptsMock,
}));

async function importRoute() {
  return await import("../route");
}

describe("GET /api/ontology/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns auth response when unauthorized", async () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
    requireAuthMock.mockResolvedValueOnce(unauthorized);

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/ontology/search");
    const res = await GET(req);

    expect(res).toBe(unauthorized);
    expect(searchOntologyConceptsMock).not.toHaveBeenCalled();
  });

  it("validates presence of query parameter", async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: "1" } });

    const { GET } = await importRoute();
    const req = new NextRequest("http://localhost/api/ontology/search");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(searchOntologyConceptsMock).not.toHaveBeenCalled();
  });

  it("parses query parameters and returns search results", async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: "7" } });
    searchOntologyConceptsMock.mockResolvedValueOnce([
      {
        id: "uuid-1",
        conceptName: "Diabetic Foot Ulcer",
        canonicalName: "Diabetic Foot Ulcer",
        conceptType: "condition",
        description: null,
        aliases: [],
        metadata: {},
        isDeprecated: false,
        similarityScore: 0.91,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-02T00:00:00.000Z",
      },
    ]);

    const { GET } = await importRoute();
    const req = new NextRequest(
      "http://localhost/api/ontology/search?query=  diabetic  wounds &limit=75&conceptType=condition&includeDeprecated=true&minScore=0.6"
    );
    const res = await GET(req);
    const body = await res.json();

    expect(searchOntologyConceptsMock).toHaveBeenCalledWith("diabetic wounds", {
      limit: 50,
      conceptType: "condition",
      includeDeprecated: true,
      minScore: 0.6,
    });

    expect(res.status).toBe(200);
    expect(body.count).toBe(1);
    expect(body.options).toEqual({
      limit: 50,
      conceptType: "condition",
      includeDeprecated: true,
      minScore: 0.6,
    });
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results[0]?.conceptName).toBe("Diabetic Foot Ulcer");
    expect(typeof body.elapsedMs).toBe("number");
  });
});

describe("POST /api/ontology/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires JSON payload", async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: "1" } });

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/ontology/search", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(searchOntologyConceptsMock).not.toHaveBeenCalled();
  });

  it("delegates to search service with body payload", async () => {
    requireAuthMock.mockResolvedValueOnce({ user: { id: "3" } });
    searchOntologyConceptsMock.mockResolvedValueOnce([]);

    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/ontology/search", {
      method: "POST",
      body: JSON.stringify({
        query: "wound assessment",
        limit: 5,
        includeDeprecated: false,
        minScore: 0.4,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(searchOntologyConceptsMock).toHaveBeenCalledWith(
      "wound assessment",
      {
        limit: 5,
        includeDeprecated: false,
        minScore: 0.4,
      }
    );
    expect(res.status).toBe(200);
    expect(body.count).toBe(0);
  });
});
