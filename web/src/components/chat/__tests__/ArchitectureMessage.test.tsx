import { renderWithProviders as render } from "@/test-utils";
import { screen } from "@testing-library/react";
import { ArchitectureMessage } from "../ArchitectureMessage";

describe("ArchitectureMessage", () => {
  it("should render message with sender and content", () => {
    const mermaidCode = "graph TD\n  A --> B";
    render(
      <ArchitectureMessage
        mermaidCode={mermaidCode}
        senderRole="CEO"
        content="Test architecture"
      />
    );

    expect(screen.getByText(/CEO Agent/)).toBeInTheDocument();
    expect(screen.getByText("Test architecture")).toBeInTheDocument();
    expect(screen.getByTestId("mermaid-container")).toBeInTheDocument();
  });

  it("should show version badge when version > 1", () => {
    render(
      <ArchitectureMessage
        mermaidCode="graph TD\n  A --> B"
        senderRole="CTO"
        content="Architecture v2"
        version={2}
      />
    );

    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("should not show version badge when version is 1", () => {
    render(
      <ArchitectureMessage
        mermaidCode="graph TD\n  A --> B"
        senderRole="CTO"
        content="Architecture version 1"
      />
    );

    expect(screen.queryByText(/^v\d+$/)).not.toBeInTheDocument();
  });
});
