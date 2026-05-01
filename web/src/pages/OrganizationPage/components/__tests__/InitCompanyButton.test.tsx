import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { screen, fireEvent } from "@testing-library/react";
import { InitCompanyButton } from "../InitCompanyButton";

// Mock the api module
vi.mock("@/lib/api", () => ({
  api: {
    initDirectorOffice: vi.fn().mockResolvedValue({
      department_id: 1,
      office_id: 1,
      agents: [],
    }),
  },
}));

describe("InitCompanyButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render button", () => {
    renderWithProviders(
      <InitCompanyButton companyId={1} onInitialized={() => {}} />
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("should open dialog on click", () => {
    renderWithProviders(
      <InitCompanyButton companyId={1} onInitialized={() => {}} />
    );

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
