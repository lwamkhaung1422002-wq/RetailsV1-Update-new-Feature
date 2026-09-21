export const promotionIsTerminal = (campaign) =>
  ["ENDED", "CANCELLED"].includes(campaign.effectiveState) || campaign.state === "CANCELLED";
