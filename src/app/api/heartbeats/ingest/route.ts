import { ingest } from "@/lib/heartbeat-receiver";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const result = await ingest({
    authHeader: request.headers.get("authorization"),
    body,
  });
  if (!result.ok) {
    const status = result.reason === "unauthorized" ? 401 : 400;
    return new Response(JSON.stringify({ error: result.message }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true, instance_id: result.instanceId }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
