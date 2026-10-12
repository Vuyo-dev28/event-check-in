import { useState, useEffect } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { TicketPdf, type TicketData } from "./TicketPdf";
import { Ticket as TicketIcon } from "lucide-react";

interface Props {
  ticket: TicketData;
}

export default function TicketPdfButton({ ticket }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function prepareQr() {
      try {
        // Enforce secure verification URL encoded in the QR code
        const verificationUrl = `${window.location.origin}/ticket/verify/${encodeURIComponent(ticket.token)}`;
        const qr = await QRCode.toDataURL(verificationUrl, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: "H",
          color: {
            dark: "#111827",
            light: "#ffffff",
          },
        });
        if (!cancelled) {
          setQrDataUrl(qr);
        }
      } catch (err) {
        console.error("Failed to generate QR data url for PDF:", err);
        if (!cancelled) {
          setError("QR Generation failed");
        }
      }
    }

    prepareQr();
    return () => {
      cancelled = true;
    };
  }, [ticket.token]);

  if (error) {
    return (
      <span className="text-xs text-destructive font-bold">
        {error}
      </span>
    );
  }

  if (!qrDataUrl) {
    return (
      <button
        disabled
        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[10px] font-bold opacity-50 cursor-not-allowed"
      >
        <span className="h-2 w-2 rounded-full border border-current border-t-transparent animate-spin" />
        Preparing PDF...
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<TicketPdf ticket={ticket} qrDataUrl={qrDataUrl} />}
      fileName={`${ticket.ticketNumber}.pdf`}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-sidebar px-3 py-2 text-[10px] font-bold text-foreground hover:bg-muted transition-all"
    >
      {({ loading }) => (
        <>
          <TicketIcon size={12} />
          {loading ? "Generating PDF..." : "Download PDF Pass"}
        </>
      )}
    </PDFDownloadLink>
  );
}
