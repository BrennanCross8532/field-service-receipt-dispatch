const endpoint = process.env.RECEIPT_SERVICE_URL ?? "http://localhost:3000/work-orders/receipt";
const recipient = process.env.RECEIPT_EMAIL_TO;
if (!recipient) throw new Error("RECEIPT_EMAIL_TO is required");

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    orderId: "WO-1048",
    customer: { name: "Jordan Lee", email: recipient },
    dispatchStatus: "completed",
    totalCents: 18900,
    currency: "USD",
    photos: [{ label: "Installed water heater", url: "https://example.com/work-orders/WO-1048/final.jpg" }],
    technicianFollowUp: { required: true, note: "We will check the pressure reading tomorrow." },
  }),
});

const result = await response.json();
console.log(response.status, result);
