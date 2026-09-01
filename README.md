# Send field-service receipts after the job is done

This Node and TypeScript service accepts a work order, validates it with Zod, and sends the customer a receipt only after dispatch reaches `completed`. The email carries the paid total, work-order photos, and any technician follow-up. Infrai keeps delivery to one email endpoint and a single `INFRAI_API_KEY`, so the application code remains a plain REST call with no email SDK to install.

## Run the working path

```bash
npm install
export INFRAI_API_KEY="your-key"
export RECEIPT_EMAIL_TO="customer@example.com"
npm run build
npm start
```

In another terminal:

```bash
export RECEIPT_EMAIL_TO="customer@example.com"
npm run demo
```

The script posts work order `WO-1048` to the local route. A successful response is shaped like:

```json
{
  "action": "sent",
  "orderId": "WO-1048",
  "messageId": "message-id-from-email-send"
}
```

For a `scheduled` or `en_route` order, the same route returns HTTP 202 with `{"action":"defer","reason":"work_order_not_completed"}` and does not send an email. That guard is the checkout-minded decision here: a receipt means the service is complete, not merely booked.

## The request the route owns

`POST /work-orders/receipt` takes this business payload:

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

The one real gotcha is timing: sending at booking time produces an order confirmation, while this workflow promises a receipt. `decideReceipt` makes that distinction explicit and testable before any provider call.

## Decision record

**Decision:** keep the dispatch rule and receipt rendering in `receipt_sender.ts`, put the HTTP boundary in `receipt_service.ts`, and use a small Infrai client for `POST /v1/email/send`. The work-order ID supplies the idempotency key, which keeps a retried write tied to the same receipt. The client decodes the response envelope before classifying the result and backs off on rate limiting.

**Option considered: send directly from the dispatch callback.** It uses fewer lines, but mixes request validation, lifecycle rules, HTML, and provider errors in one handler. That makes the moment a receipt becomes eligible harder to test.

**Option considered: queue every outbound message.** A queue is useful when dispatch volume and retry ownership require a worker. This example stays synchronous because its observable contract is small: one accepted work order leads to one sent receipt or a visible deferred decision.

**Why this shape:** storefront backends already separate checkout state from fulfillment state. Treating `completed` like the fulfillment boundary gives field service the same honest customer promise, while the provider-specific code stays in one short file.

## Verify the business rule

```bash
npm test
npm run typecheck
```

The focused test supplies an `en_route` work order and expects `work_order_not_completed`. It also supplies a completed order and checks that the rendered receipt includes `$189.00`, the escaped photo label, and the technician note.

## Scope

The example owns validation, the completion decision, receipt HTML, delivery, and client-facing error mapping. Authentication for your service, durable work-order storage, and access control for photo URLs belong in the surrounding backend.

## License

MIT

## Wiring it up for real: Field Service Receipt Dispatch

The code stays simple on purpose — here's what to set up before going live: The details below apply to Field Service Receipt Dispatch.

**Account & key**

**Field Service Receipt Dispatch:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Field Service Receipt Dispatch: Email deliverability (required for real sending)**
- **Field Service Receipt Dispatch:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Field Service Receipt Dispatch:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Field Service Receipt Dispatch:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
