import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock window object
Object.defineProperty(window, "__HERMES_SESSION_TOKEN__", {
  value: undefined,
  writable: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

describe("initDirectorOffice", () => {
  it("should call POST /api/org/companies/:id/init-director-office", async () => {
    const result = await api.initDirectorOffice({
      companyId: 1,
      agentCount: 3,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/org/companies/1/init-director-office"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ agent_count: 3 }),
      })
    );
  });

  it("should use default agentCount of 3 when not provided", async () => {
    await api.initDirectorOffice({
      companyId: 1,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/org/companies/1/init-director-office"),
      expect.objectContaining({
        body: JSON.stringify({ agent_count: 3 }),
      })
    );
  });
});

describe("startDirectorDiscussion", () => {
  it("should call POST /api/org/companies/:id/start-discussion", async () => {
    await api.startDirectorDiscussion(1);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/org/companies/1/start-discussion"),
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});
