import { renderWithProviders as render } from "@/test-utils";
import { screen } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble";

describe("MessageBubble", () => {
  it("should show agent avatar and role badge", () => {
    const message = {
      role: "assistant" as const,
      content: "Hello from CEO",
      sender_agent_role: "CEO",
      sender_agent_id: 123,
    };

    render(<MessageBubble message={message} />);

    // Should show role badge (not just content)
    const badges = screen.getAllByText("CEO");
    expect(badges.length).toBeGreaterThan(0);
    // Content should also be present
    expect(screen.getByText("Hello from CEO")).toBeInTheDocument();
  });
});
