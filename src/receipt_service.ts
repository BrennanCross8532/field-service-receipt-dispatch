import { createServer } from "node:http";
import { ZodError } from "zod";
import { InfraiError } from "./infrai_email.js";
import { processWorkOrder } from "./receipt_sender.js";

function json(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-orders/receipt") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await processWorkOrder(body);
    json(response, result.action === "defer" ? 202 : 201, result);
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { error: "invalid_work_order", issues: error.issues });
    } else if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
    } else if (error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_json" });
    } else {
      json(response, 500, { error: "request_failed" });
    }
  }
});

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`Receipt service listening on http://localhost:${port}`));
}
