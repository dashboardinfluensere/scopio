import { Resend } from "resend";

const EMAIL_FROM =
  process.env.EMAIL_FROM || "Scopio <noreply@mail.scopio.no>";

const ADMIN_ACCESS_REQUESTS_URL = "https://scopio.no/admin/access-requests";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error("[email] RESEND_API_KEY mangler");
    return null;
  }

  return new Resend(apiKey);
}

export async function sendNewAccessRequestNotification(params: {
  adminEmail: string;
  requesterEmail: string;
  note?: string | null;
}) {
  const { adminEmail, requesterEmail, note } = params;

  const resend = getResendClient();
  if (!resend) return;

  try {
    console.log("[email] Sender admin-varsel til:", adminEmail);

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to: adminEmail,
      subject: "Ny tilgangsforespørsel til Scopio",
      html: `
        <h2>Ny tilgangsforespørsel</h2>
        <p><strong>E-post:</strong> ${escapeHtml(requesterEmail)}</p>
        ${
          note
            ? `<p><strong>Kommentar:</strong><br>${escapeHtml(note)}</p>`
            : "<p><strong>Kommentar:</strong> Ingen</p>"
        }
        <p>
          <a href="${ADMIN_ACCESS_REQUESTS_URL}" target="_blank" rel="noopener noreferrer">
            Gå til admin-siden for tilgangsforespørsler
          </a>
        </p>
      `,
    });

    console.log("[email] Resend admin response:", result);
  } catch (error) {
    console.error("[email] Kunne ikke sende admin-varsel:", error);
  }
}

export async function sendAccessApprovedEmail(params: {
  to: string;
}) {
  const { to } = params;

  const resend = getResendClient();
  if (!resend) return;

  try {
    console.log("[email] Sender godkjenningsmail til:", to);

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "Tilgangen din til Scopio er godkjent 🚀",
      html: `
        <h2>Du har fått tilgang</h2>
        <p>Forespørselen din er nå godkjent.</p>
        <p>Du kan nå åpne Scopio, velge plan og opprette workspace.</p>
        <p>Velkommen 🚀</p>
      `,
    });

    console.log("[email] Resend approved response:", result);
  } catch (error) {
    console.error("[email] Kunne ikke sende godkjenningsmail:", error);
  }
}

export async function sendAccessRejectedEmail(params: {
  to: string;
}) {
  const { to } = params;

  const resend = getResendClient();
  if (!resend) return;

  try {
    console.log("[email] Sender avslagsmail til:", to);

    const result = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: "Oppdatering på tilgangsforespørselen din til Scopio",
      html: `
        <h2>Tilgangsforespørselen ble ikke godkjent</h2>
        <p>Forespørselen din til Scopio ble dessverre ikke godkjent denne gangen.</p>
        <p>Du kan eventuelt prøve igjen senere.</p>
      `,
    });

    console.log("[email] Resend rejected response:", result);
  } catch (error) {
    console.error("[email] Kunne ikke sende avslagsmail:", error);
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}