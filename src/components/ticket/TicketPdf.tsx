import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 24,
    backgroundColor: "#f3f4f6",
  },
  ticket: {
    display: "flex",
    flexDirection: "row",
    width: "100%",
    minHeight: 240,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  artwork: {
    width: 90,
    backgroundColor: "#111827",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  artworkTitle: {
    color: "#c2ef50",
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  artworkBottom: {
    color: "#9ca3af",
    fontSize: 7,
    fontWeight: "bold",
    letterSpacing: 1.5,
  },
  main: {
    flex: 1,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 7,
    color: "#6b7280",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  eventName: {
    marginTop: 4,
    fontSize: 18,
    color: "#111827",
    fontWeight: "bold",
  },
  details: {
    display: "flex",
    flexDirection: "row",
    marginTop: 14,
    gap: 14,
  },
  detail: {
    flex: 1,
  },
  label: {
    fontSize: 6,
    color: "#9ca3af",
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  value: {
    marginTop: 2,
    fontSize: 9,
    color: "#111827",
    fontWeight: "bold",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },
  infoGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
  },
  info: {
    flex: 1,
  },
  qrSection: {
    width: 150,
    borderLeftWidth: 1,
    borderLeftStyle: "dashed",
    borderLeftColor: "#d1d5db",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketType: {
    fontSize: 8,
    color: "#111827",
    fontWeight: "bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
    textAlign: "center",
  },
  qr: {
    width: 100,
    height: 100,
  },
  ticketNumber: {
    marginTop: 8,
    fontSize: 7,
    fontFamily: "Courier",
    color: "#4b5563",
  },
  admit: {
    marginTop: 8,
    backgroundColor: "#111827",
    color: "#c2ef50",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 6,
    fontWeight: "bold",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  footer: {
    marginTop: 14,
    fontSize: 5.5,
    color: "#9ca3af",
    lineHeight: 1.4,
  },
});

export interface TicketData {
  id: number;
  ticketNumber: string;
  token: string;
  buyerName?: string;
  buyerEmail?: string;
  attendeeName: string;
  attendeeEmail: string;
  type: string;
  eventName: string;
  eventDate?: string;
  startTime?: string;
  venue?: string;
  orderNumber?: string;
  status: string;
  cashlessNumber?: string;
  cashlessBalance?: number;
}

interface TicketPdfProps {
  ticket: TicketData;
  qrDataUrl: string;
}

export function TicketPdf({ ticket, qrDataUrl }: TicketPdfProps) {
  const dateDisplay = ticket.eventDate
    ? ticket.startTime
      ? `${ticket.eventDate} · ${ticket.startTime}`
      : ticket.eventDate
    : "See Event Page";
  const venueDisplay = ticket.venue || "Venue TBA";
  const orderRef = ticket.orderNumber || `TKT-${ticket.id}`;

  return (
    <Document
      title={`${ticket.eventName} - ${ticket.ticketNumber}`}
      author="Howler Tickets Marketplace"
      subject="Digital Event Pass"
    >
      <Page size="A5" orientation="landscape" style={styles.page}>
        <View style={styles.ticket}>
          <View style={styles.artwork}>
            <Text style={styles.artworkTitle}>EVENT PASS</Text>
            <Text style={styles.artworkBottom}>ADMIT ONE</Text>
          </View>

          <View style={styles.main}>
            <View>
              <Text style={styles.eyebrow}>Verified Entrance Entitlement</Text>
              <Text style={styles.eventName}>{ticket.eventName}</Text>
            </View>

            <View style={styles.details}>
              <View style={styles.detail}>
                <Text style={styles.label}>Date & Time</Text>
                <Text style={styles.value}>{dateDisplay}</Text>
              </View>
              <View style={styles.detail}>
                <Text style={styles.label}>Venue</Text>
                <Text style={styles.value}>{venueDisplay}</Text>
              </View>
              <View style={styles.detail}>
                <Text style={styles.label}>Order Ref</Text>
                <Text style={styles.value}>{orderRef}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoGrid}>
              <View style={styles.info}>
                <Text style={styles.label}>Assigned Attendee</Text>
                <Text style={styles.value}>{ticket.attendeeName}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.label}>Tier</Text>
                <Text style={styles.value}>{ticket.type}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.label}>RFID Cashless</Text>
                <Text style={styles.value}>{ticket.cashlessNumber || "Unlinked"}</Text>
              </View>
            </View>

            <Text style={styles.footer}>
              This digital pass is validated electronically once at the venue gate. Do not duplicate or share your QR token publicly.
              Manage transfers or cashless top-ups from your My Tickets dashboard.
            </Text>
          </View>

          <View style={styles.qrSection}>
            <Text style={styles.ticketType}>{ticket.type}</Text>
            <Image src={qrDataUrl} style={styles.qr} />
            <Text style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
            <Text style={styles.admit}>{ticket.status === "VALID" ? "ADMIT ONE" : ticket.status}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

interface BulkTicketsPdfProps {
  tickets: TicketData[];
  qrDataUrls: Record<string, string>;
}

export function BulkTicketsPdf({ tickets, qrDataUrls }: BulkTicketsPdfProps) {
  return (
    <Document title="All Event Passes" author="Howler Tickets Marketplace" subject="Digital Passes">
      {tickets.map((ticket) => {
        const dateDisplay = ticket.eventDate
          ? ticket.startTime
            ? `${ticket.eventDate} · ${ticket.startTime}`
            : ticket.eventDate
          : "See Event Page";
        const venueDisplay = ticket.venue || "Venue TBA";
        const orderRef = ticket.orderNumber || `TKT-${ticket.id}`;
        return (
          <Page key={ticket.ticketNumber} size="A5" orientation="landscape" style={styles.page}>
            <View style={styles.ticket}>
              <View style={styles.artwork}>
                <Text style={styles.artworkTitle}>EVENT PASS</Text>
                <Text style={styles.artworkBottom}>ADMIT ONE</Text>
              </View>

              <View style={styles.main}>
                <View>
                  <Text style={styles.eyebrow}>Verified Entrance Entitlement</Text>
                  <Text style={styles.eventName}>{ticket.eventName}</Text>
                </View>

                <View style={styles.details}>
                  <View style={styles.detail}>
                    <Text style={styles.label}>Date & Time</Text>
                    <Text style={styles.value}>{dateDisplay}</Text>
                  </View>
                  <View style={styles.detail}>
                    <Text style={styles.label}>Venue</Text>
                    <Text style={styles.value}>{venueDisplay}</Text>
                  </View>
                  <View style={styles.detail}>
                    <Text style={styles.label}>Order Ref</Text>
                    <Text style={styles.value}>{orderRef}</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.infoGrid}>
                  <View style={styles.info}>
                    <Text style={styles.label}>Assigned Attendee</Text>
                    <Text style={styles.value}>{ticket.attendeeName}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.label}>Tier</Text>
                    <Text style={styles.value}>{ticket.type}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.label}>RFID Cashless</Text>
                    <Text style={styles.value}>{ticket.cashlessNumber || "Unlinked"}</Text>
                  </View>
                </View>

                <Text style={styles.footer}>
                  This digital pass is validated electronically once at the venue gate. Do not duplicate or share your QR token publicly.
                </Text>
              </View>

              <View style={styles.qrSection}>
                <Text style={styles.ticketType}>{ticket.type}</Text>
                <Image src={qrDataUrls[ticket.ticketNumber] || ""} style={styles.qr} />
                <Text style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
                <Text style={styles.admit}>{ticket.status === "VALID" ? "ADMIT ONE" : ticket.status}</Text>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
