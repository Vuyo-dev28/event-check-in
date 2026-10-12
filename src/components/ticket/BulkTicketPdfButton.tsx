import { useState, useEffect } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { BulkTicketsPdf, type TicketData } from "./TicketPdf";
import { DownloadCloud } from "lucide-react";

interface Props {
  tickets: TicketData[];
}

export default function BulkTicketPdfButton({ tickets }: Props) {
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function prepareAllQrs() {
      try {
        const urls: Record<string, string> = {};
        for (const ticket of tickets) {
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
          urls[ticket.ticketNumber] = qr;
        }
        if (!cancelled) {
          setQrDataUrls(urls);
        }
      } catch (err) {
        console.error("Failed to generate bulk QR codes:", err);
        if (!cancelled) {
          setError("Bulk QR Generation failed");
        }
      }
    }

    if (tickets && tickets.length > 0) {
      prepareAllQrs();
    }
    return () => {
      cancelled = true;
    };
  }, [tickets]);

  if (error) {
    return <span className="text-xs text-destructive font-bold">{error}</span>;
  }

  if (tickets.length === 0) {
    return null;
  }

  if (!qrDataUrls) {
    return (
      <button
        disabled
        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-sidebar px-4 py-2.5 text-xs font-bold opacity-50 cursor-not-allowed"
      >
        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        Preparing Bulk PDF...
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={<BulkTicketsPdf tickets={tickets} qrDataUrls={qrDataUrls} />}
      fileName="all_event_tickets.pdf"
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground hover:brightness-95 transition-all shadow-sm"
    >
      {({ loading }) => (
        <>
          <DownloadCloud size={14} />
          {loading ? "Generating All PDFs..." : `Download All ${tickets.length} Passes`}
        </>
      )}
    </PDFDownloadLink>
  );
}
