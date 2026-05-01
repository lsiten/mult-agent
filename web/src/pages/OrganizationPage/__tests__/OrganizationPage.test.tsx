import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test-utils";
import { screen } from "@testing-library/react";
import OrganizationPage from "../index";
import { useOrganizationPageController } from "../useOrganizationPageController";

vi.mock("../useOrganizationPageController", () => ({
  useOrganizationPageController: vi.fn(),
}));

describe("OrganizationPage", () => {
  it("should show init button next to company name", () => {
    vi.mocked(useOrganizationPageController).mockReturnValue({
      t: { organization: { initDirectorOffice: "Initialize company" }, common: { cancel: "Cancel", confirm: "Confirm" } },
      selectedCompany: { id: 1, name: "Test Company", goal: "Test Goal", icon: "🏢", accent_color: "#000" },
      loading: false,
      multipleCompanies: false,
      openCreateCompany: vi.fn(),
      refreshSelectedCompany: vi.fn(),
      openCreate: vi.fn(),
      deleteNode: vi.fn(),
      openEdit: vi.fn(),
      moveCompany: vi.fn(),
      dialog: null,
      toast: { show: vi.fn(), hide: vi.fn() },
    });

    renderWithProviders(<OrganizationPage />);

    const initButton = screen.getByTitle(/initialize company/i);
    expect(initButton).toBeInTheDocument();
  });
});
