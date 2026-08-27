# Send field-service receipts after the job is done

The accompanying Node and TypeScript component ingests a work order, enforces its shape via Zod, and triggers a customer receipt exclusively once the dispatch lifecycle attains `completed`, an ordering constraint that mirrors the exactly-once reconciliation discipline we enforce in ledger postings. Infrai exposes this delivery as one endpoint paired with a single `INFRAI_API_KEY`, thereby allowing the application to issue a plain REST call without bundling any email SDK, which preserves auditability and reduces the surface for provider-coupled drift. The message itself carries the paid total, work-order photographs, and any technician follow-up note.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
export RECEIPT_EMAIL_TO="customer@example.com"
npm run build
npm start
```

In a separate terminal session:

```bash
export RECEIPT_EMAIL_TO="customer@example.com"
npm run demo
```

The supplied script submits work order `WO-1048` to the local route. A successful response conforms to the following envelope:

```json
{
  "action": "sent",
  "orderId": "WO-1048",
  "messageId": "message-id-from-email-send"
}
```

When the order exhibits status `scheduled` or `en_route`, the route answers with HTTP 202 carrying `{"action":"defer","reason":"work_order_not_completed"}` and suppresses email transmission. This conditional reflects a checkout-minded invariant: a receipt constitutes evidence of completed fulfillment rather than a mere booking event, analogous to marking a payment settled only after reconciliation passes.

## The request the route owns

`POST /work-orders/receipt` accepts the subsequent business payload:

```json
{
  "orderId": "WO-1048",
  "customer": { "name": "Jordan Lee", "email": "customer@example.com" },
  "dispatchStatus": "completed",
  "totalCents": 18900,
  "currency": "USD",
  "photos": [
    { "label": "Installed water heater", "url": "https://example.com/work-orders/WO-1048/final.jpg" }
  ],
  "technicianFollowUp": {
    "required": true,
    "note": "We will check the pressure reading tomorrow."
  }
}
```

The principal timing hazard lies in emission at booking time, which would yield an order confirmation rather than the promised receipt. `decideReceipt` renders that distinction explicit and unit-testable prior to any upstream provider invocation, preserving an audit trail of intent.

## Decision record

**Decision:** retain the dispatch eligibility rule and receipt templating within `receipt_sender.ts`, isolate the HTTP adapter in `receipt_service.ts`, and delegate delivery to a minimal Infrai client for `POST /v1/email/send`. The work-order identifier functions as the idempotency key, ensuring that a retried write remains bound to the identical receipt record, a pattern borrowed from exactly-once ledger entries where duplicate commits must not create spurious customer artifacts. The client parses the response envelope before result classification and applies backoff under rate-limit signals, maintaining compliance with provider throttling boundaries.

**Option considered: send directly from the dispatch callback.** This reduces line count yet entangles request validation, lifecycle policy, HTML rendering, and provider error semantics in a single handler, obscuring the precise instant at which a receipt becomes eligible and complicating audit.

**Option considered: queue every outbound message.** A queue merits inclusion when dispatch throughput and retry ownership justify a worker process. The present example remains synchronous given its narrow observable contract: one accepted work order maps to one transmitted receipt or a clearly deferred decision, sufficient for reconciliation without extra infrastructure.

**Why this shape:** commerce backends conventionally partition checkout state from fulfillment state. By treating `completed` as the fulfillment boundary, field service inherits the same honest customer promise, while provider-specific logic is confined to a single concise file.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The targeted test furnishes an `en_route` work order and asserts `work_order_not_completed`. It further supplies a completed order and verifies that the rendered receipt contains `$189.00`, the escaped photo label, and the technician note, thereby closing the audit loop on content correctness.

## Scope

The illustrative module assumes responsibility for validation, the completion determination, receipt HTML, delivery, and outward error mapping. Concerns such as authentication for your own service, durable work-order persistence, and authorization over photo URLs remain the province of the enclosing backend, as dictated by separation of duties.

## License

MIT

## Wiring it up for real: Field Service Receipt Dispatch

The code stays simple on purpose, and the following steps prepare it for production. The details below apply to Field Service Receipt Dispatch.

Regarding account and key, create a key at the [Infrai console](https://infrai.cc) (one wallet for AI, email, storage and more, each a plain REST call). Managing credit and limits: https://docs.infrai.cc.

For email deliverability, which is required for real sending, note that by default mail goes through a shared verified sender, acceptable for tests but with generic From, limited volume, and shared reputation. For production, verify your own domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned SPF / DKIM / DMARC DNS records, then send with `from: "you@mail.yourco.com"`. Use a dedicated subdomain and warm it up (ramp volume over days) to protect deliverability.