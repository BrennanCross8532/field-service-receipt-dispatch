import { describe, expect, it } from "vitest";
import { decideReceipt, workOrderSchema } from "../src/receipt_sender.js";

const order = workOrderSchema.parse({
  orderId: "WO-1048",
  customer: { name: "Jordan & Lee", email: "customer@example.com" },
  dispatchStatus: "completed",
  totalCents: 18900,
  currency: "USD",
  photos: [{ label: "Final <installation>", url: "https://example.com/final.jpg" }],
  technicianFollowUp: { required: true, note: "Check pressure tomorrow." },
});

describe("receipt dispatch decision", () => {
  it("defers the receipt until field work is completed", () => {
    const decision = decideReceipt({ ...order, dispatchStatus: "en_route" });
    expect(decision).toEqual({ action: "defer", reason: "work_order_not_completed" });
  });

  it("includes proof of work and technician follow-up in a completed receipt", () => {
    const decision = decideReceipt(order);
    expect(decision.action).toBe("send");
    if (decision.action === "send") {
      expect(decision.html).toContain("$189.00");
      expect(decision.html).toContain("Final &lt;installation&gt;");
      expect(decision.html).toContain("Check pressure tomorrow.");
      expect(decision.html).toContain("Jordan &amp; Lee");
    }
  });
});
