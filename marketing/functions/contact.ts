// Cloudflare Pages Function. POST /contact handler.
// Sends inbound contact-form messages to the vendor inbox via MailChannels
// (free for outbound mail from Cloudflare Workers/Pages).

interface Env {
  CONTACT_TO?: string;       // override at deploy time; defaults to hello@qualitymate.com.au
  CONTACT_FROM?: string;     // sender domain must be verified for MailChannels
}

interface ContactBody {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  message?: string;
  website?: string; // honeypot
}

function isString(v: unknown, max = 4000): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= max;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Honeypot — silently accept and discard.
  if (body.website && body.website.trim().length > 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (
    !isString(body.name, 120) ||
    !isString(body.email, 200) ||
    !isString(body.message, 4000)
  ) {
    return new Response("Missing required fields", { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
    return new Response("Invalid email", { status: 400 });
  }

  const to = env.CONTACT_TO ?? "hello@qualitymate.com.au";
  const from = env.CONTACT_FROM ?? "no-reply@qualitymate.com.au";

  const text = [
    `Name:    ${body.name}`,
    `Company: ${body.company ?? ""}`,
    `Email:   ${body.email}`,
    `Phone:   ${body.phone ?? ""}`,
    "",
    body.message,
  ].join("\n");

  const html = `
    <p><strong>Name:</strong> ${escapeHtml(body.name)}</p>
    <p><strong>Company:</strong> ${escapeHtml(body.company ?? "")}</p>
    <p><strong>Email:</strong> ${escapeHtml(body.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(body.phone ?? "")}</p>
    <hr />
    <pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(body.message ?? "")}</pre>
  `;

  const payload = {
    personalizations: [{ to: [{ email: to }] }],
    from: { email: from, name: "QualityMate website" },
    reply_to: { email: body.email, name: body.name },
    subject: `[QualityMate] Contact: ${body.name}`,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: html },
    ],
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(`Send failed: ${err}`, { status: 502 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
