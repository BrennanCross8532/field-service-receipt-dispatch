import { z } from "zod";
import { infrai } from "./infrai_email.js";

export const workOrderSchema = z.object({
  orderId: z.string().min(1),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  dispatchStatus: z.enum(["scheduled", "en_route", "completed"]),
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  photos: z.array(z.object({ label: z.string().min(1), url: z.string().url() })).max(12),
  technicianFollowUp: z.object({
    required: z.boolean(),
    note: z.string().min(1).optional(),
  }),
});

export type WorkOrder = z.infer<typeof workOrderSchema>;

export type ReceiptDecision =
  | { action: "defer"; reason: "work_order_not_completed" }
  | { action: "send"; subject: string; html: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

export function decideReceipt(workOrder: WorkOrder): ReceiptDecision {
  if (workOrder.dispatchStatus !== "completed") {
    return { action: "defer", reason: "work_order_not_completed" };
  }

  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: workOrder.currency.toUpperCase(),
  }).format(workOrder.totalCents / 100);
  const photoList = workOrder.photos.length
    ? `<h2>Work photos</h2><ul>${workOrder.photos
        .map((photo) => `<li><a href="${escapeHtml(photo.url)}">${escapeHtml(photo.label)}</a></li>`)
        .join("")}</ul>`
    : "";
  const followUp = workOrder.technicianFollowUp.required
    ? `<h2>Technician follow-up</h2><p>${escapeHtml(workOrder.technicianFollowUp.note ?? "The technician will contact you.")}</p>`
    : "<p>No technician follow-up is needed.</p>";

  return {
    action: "send",
    subject: `Receipt for work order ${workOrder.orderId}`,
    html: `<h1>Service complete</h1><p>Hi ${escapeHtml(workOrder.customer.name)},</p><p>We received ${amount} for work order ${escapeHtml(workOrder.orderId)}.</p>${photoList}${followUp}`,
  };
}

export async function processWorkOrder(input: unknown) {
  const workOrder = workOrderSchema.parse(input);
  const decision = decideReceipt(workOrder);
  if (decision.action === "defer") return decision;

  const sent = await infrai.email.send(
    { to: workOrder.customer.email, subject: decision.subject, html: decision.html },
    `work-order-receipt:${workOrder.orderId}`,
  );
  return { action: "sent" as const, orderId: workOrder.orderId, messageId: sent.message_id };
}
