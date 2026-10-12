import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

// Styles for the landscape ticket layout (A5 orientation)
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
    fontSize: 20,
    color: "#111827",
    fontWeight: "bold",
  },
  details: {
    display: "flex",
    flexDirection: "row",
    marginTop: 16,
    gap: 16,
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
    marginVertical: 14,
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
    marginTop: 16,
    fontSize: 5.5,
    color: "#9ca3af",
    lineHeight: 1.4,
  },
});

export interface TicketData {
  id: number;
  ticketNumber: string;
  token: string;
  buyerName: string;
  buyerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  type: string;
  eventName: string;
  status: string;
  cashlessNumber?: string;
  cashlessBalance?: number;
}

interface TicketPdfProps {
  ticket: TicketData;
  qrDataUrl: string;
}

export function TicketPdf({
  ticket,
  qrDataUrl,
}: TicketPdfProps) {
  return (
    <Document
      title={`${ticket.eventName} - ${ticket.ticketNumber}`}
      author="Event Check-In Platform"
      subject="Digital Pass"
    >
      <Page
        size="A5"
        orientation="landscape"
        style={styles.page}
      >
        <View style={styles.ticket}>
          {/* LEFT DARK FLAP */}
          <View style={styles.artwork}>
            <Text style={styles.artworkTitle}>NORTHSTAR</Text>
            <Text style={styles.artworkBottom}>ADMIT ONE</Text>
          </View>

          {/* MAIN PORTION */}
          <View style={styles.main}>
            <View>
              <Text style={styles.eyebrow}>Verified Entrance Entitlement</Text>
              <Text style={styles.eventName}>{ticket.eventName}</Text>
            </View>

            <View style={styles.details}>
              <View style={styles.detail}>
                <Text style={styles.label}>Date & Time</Text>
                <Text style={styles.value}>Today · 18 June 2024</Text>
              </View>
              <View style={styles.detail}>
                <Text style={styles.label}>Venue</Text>
                <Text style={styles.value}>Pier 48, San Francisco</Text>
              </View>
              <View style={styles.detail}>
                <Text style={styles.label}>Order Ref</Text>
                <Text style={styles.value}>ORD-{ticket.id * 123 + 456}</Text>
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
                <Text style={styles.value}>{ticket.cashlessNumber || "No RFID"}</Text>
              </View>
            </View>

            <Text style={styles.footer}>
              This digital pass is validated electronically at the gates. Do not duplicate.
              RFID cashless top-ups and spending can be managed directly from your attendee portal dashboard.
            </Text>
          </View>

          {/* QR STUB SECTION */}
          <View style={styles.qrSection}>
            <Text style={styles.ticketType}>{ticket.type}</Text>
            <Image src={qrDataUrl} style={styles.qr} />
            <Text style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
            <Text style={styles.admit}>ADMIT ONE</Text>
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
    <Document
      title="All Passes"
      author="Event Check-In Platform"
      subject="Digital Passes"
    >
      {tickets.map((ticket) => (
        <Page
          key={ticket.ticketNumber}
          size="A5"
          orientation="landscape"
          style={styles.page}
        >
          <View style={styles.ticket}>
            {/* LEFT DARK FLAP */}
            <View style={styles.artwork}>
              <Text style={styles.artworkTitle}>NORTHSTAR</Text>
              <Text style={styles.artworkBottom}>ADMIT ONE</Text>
            </View>

            {/* MAIN PORTION */}
            <View style={styles.main}>
              <View>
                <Text style={styles.eyebrow}>Verified Entrance Entitlement</Text>
                <Text style={styles.eventName}>{ticket.eventName}</Text>
              </View>

              <View style={styles.details}>
                <View style={styles.detail}>
                  <Text style={styles.label}>Date & Time</Text>
                  <Text style={styles.value}>Today · 18 June 2024</Text>
                </View>
                <View style={styles.detail}>
                  <Text style={styles.label}>Venue</Text>
                  <Text style={styles.value}>Pier 48, San Francisco</Text>
                </View>
                <View style={styles.detail}>
                  <Text style={styles.label}>Order Ref</Text>
                  <Text style={styles.value}>ORD-{ticket.id * 123 + 456}</Text>
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
                  <Text style={styles.value}>{ticket.cashlessNumber || "No RFID"}</Text>
                </View>
              </View>

              <Text style={styles.footer}>
                This digital pass is validated electronically at the gates. Do not duplicate.
                RFID cashless top-ups and spending can be managed directly from your attendee portal dashboard.
              </Text>
            </View>

            {/* QR STUB SECTION */}
            <View style={styles.qrSection}>
              <Text style={styles.ticketType}>{ticket.type}</Text>
              <Image src={qrDataUrls[ticket.ticketNumber] || ""} style={styles.qr} />
              <Text style={styles.ticketNumber}>{ticket.ticketNumber}</Text>
              <Text style={styles.admit}>ADMIT ONE</Text>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
}
