import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PromotionActions } from "./PricePage";
import { promotionIsTerminal } from "./promotionState";

afterEach(cleanup);

describe("promotion terminal actions", () => {
  it.each([
    [{ effectiveState: "ENDED", state: "SCHEDULED" }, true],
    [{ effectiveState: "CANCELLED", state: "CANCELLED" }, true],
    [{ effectiveState: "RUNNING", state: "SCHEDULED" }, false],
  ])("derives terminal state from authoritative promotion state", (campaign, expected) => {
    expect(promotionIsTerminal(campaign)).toBe(expected);
  });

  it.each([
    ["active", false],
    ["ended", true],
    ["cancelled", true],
  ])("keeps actions visible with the correct disabled state for %s promotions", (_label, ended) => {
    render(<PromotionActions product={{ name: "Sale", ended }} onEdit={vi.fn()} onEnd={vi.fn()} onReport={vi.fn()} ending={false} />);
    fireEvent.click(screen.getByLabelText("Actions for Sale"));
    const edit = screen.getByText("Edit").closest("li");
    const end = screen.getByText("End").closest("li");
    if (ended) {
      expect(edit?.getAttribute("aria-disabled")).toBe("true");
      expect(end?.getAttribute("aria-disabled")).toBe("true");
    } else {
      expect(edit?.hasAttribute("aria-disabled")).toBe(false);
      expect(end?.hasAttribute("aria-disabled")).toBe(false);
    }
    expect(screen.getByText("Report")).toBeTruthy();
  });
});
