import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Registered users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  role: text('role').notNull().default('attendee'), // 'attendee' | 'organizer' | 'superadmin'
  firstName: text('first_name'),
  lastName: text('last_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

// User relations
export const usersRelations = relations(users, ({ many }) => ({
  tickets: many(tickets),
  businessMemberships: many(businessTeam),
  platformRoles: many(platformTeam),
  orders: many(orders),
}));

// Businesses / Organisers Table
export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('business_type').notNull(), // 'Nightclub' | 'Festival' | 'Concert' | etc.
  contactPerson: text('contact_person'),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  country: text('country'),
  address: text('address'),
  website: text('website'),
  logo: text('logo'),
  description: text('description'),
  status: text('status').notNull().default('PENDING'), // PENDING, ACTIVE, SUSPENDED, REJECTED
  grossSales: integer('gross_sales').notNull().default(0), // in dollars
  platformFees: integer('platform_fees').notNull().default(0), // in dollars
  refundedAmt: integer('refunded_amt').notNull().default(0), // in dollars
  pendingPayout: integer('pending_payout').notNull().default(0), // in dollars
  paidPayout: integer('paid_payout').notNull().default(0), // in dollars
  createdAt: timestamp('created_at').defaultNow(),
});

// Business relations
export const businessesRelations = relations(businesses, ({ many }) => ({
  venues: many(venues),
  events: many(events),
  team: many(businessTeam),
  orders: many(orders),
  payouts: many(payouts),
  auditLogs: many(auditLogs),
}));

// Physical Event Venues
export const venues = pgTable('venues', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  address: text('address').notNull(),
  city: text('city').notNull(),
  province: text('province'),
  country: text('country'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  capacity: integer('capacity').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Venue relations
export const venuesRelations = relations(venues, ({ one, many }) => ({
  business: one(businesses, {
    fields: [venues.businessId],
    references: [businesses.id],
  }),
  events: many(events),
}));

// Curated & Published Events
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  venueId: integer('venue_id').references(() => venues.id),
  name: text('name').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  logo: text('logo'),
  address: text('address'), // Fallback address
  dateText: text('date_text').notNull(), // '18 June 2024' or standard texts
  startTime: text('start_time'),
  endTime: text('end_time'),
  timezone: text('timezone'),
  category: text('category').notNull(),
  ageRestriction: text('age_restriction'),
  status: text('status').notNull().default('DRAFT'), // DRAFT, PENDING_APPROVAL, PUBLISHED, PAUSED, SOLD_OUT, COMPLETED, CANCELLED
  createdAt: timestamp('created_at').defaultNow(),
});

// Event relations
export const eventsRelations = relations(events, ({ one, many }) => ({
  business: one(businesses, {
    fields: [events.businessId],
    references: [businesses.id],
  }),
  venue: one(venues, {
    fields: [events.venueId],
    references: [venues.id],
  }),
  ticketTypes: many(ticketTypes),
  orders: many(orders),
}));

// Ticket Categories / Types per Event
export const ticketTypes = pgTable('ticket_types', {
  id: serial('id').primaryKey(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  name: text('name').notNull(), // 'General Admission', 'VIP pass', etc.
  description: text('description'),
  price: integer('price').notNull(), // Standard ticket price (in integer dollars)
  quantity: integer('quantity').notNull(), // capacity cap
  remaining: integer('remaining').notNull(),
  saleStart: timestamp('sale_start'),
  saleEnd: timestamp('sale_end'),
  minPurchase: integer('min_purchase').default(1),
  maxPurchase: integer('max_purchase').default(8),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE
  isReserved: integer('is_reserved').default(0), // 0: general admission, 1: seated
  createdAt: timestamp('created_at').defaultNow(),
});

// TicketTypes relations
export const ticketTypesRelations = relations(ticketTypes, ({ one, many }) => ({
  event: one(events, {
    fields: [ticketTypes.eventId],
    references: [events.id],
  }),
  orderItems: many(orderItems),
}));

// Orders table for processing payments & purchases
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id), // Nullable for guest purchases
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  buyerName: text('buyer_name').notNull(),
  buyerEmail: text('buyer_email').notNull(),
  subtotal: integer('subtotal').notNull(), // In dollars
  discount: integer('discount').notNull().default(0), // In dollars
  serviceFee: integer('service_fee').notNull(), // In dollars
  total: integer('total').notNull(), // In dollars
  platformFeeCut: integer('platform_fee_cut').notNull().default(0), // In dollars
  status: text('status').notNull().default('PENDING'), // PENDING, PAID, REFUNDED, CANCELLED
  promoCode: text('promo_code'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Orders relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  business: one(businesses, {
    fields: [orders.businessId],
    references: [businesses.id],
  }),
  event: one(events, {
    fields: [orders.eventId],
    references: [events.id],
  }),
  orderItems: many(orderItems),
  tickets: many(tickets),
}));

// Individual purchased order items mapping
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  ticketTypeId: integer('ticket_type_id').references(() => ticketTypes.id).notNull(),
  quantity: integer('quantity').notNull(),
  price: integer('price').notNull(),
});

// Order items relations
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  ticketType: one(ticketTypes, {
    fields: [orderItems.ticketTypeId],
    references: [ticketTypes.id],
  }),
}));

// Tickets table (extended with additional fields for SaaS features)
export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(), // QR validation token
  ticketNumber: text('ticket_number').notNull().unique(),
  buyerName: text('buyer_name'),
  buyerEmail: text('buyer_email'),
  attendeeName: text('attendee_name').notNull(),
  attendeeEmail: text('attendee_email').notNull(), // Howler individual assignment
  type: text('type').notNull(), // 'General admission', 'VIP pass', etc.
  eventName: text('event_name').notNull(),
  status: text('status').notNull().default('VALID'), // 'VALID' | 'CHECKED_IN' | 'INVALID' | 'REFUNDED' | 'CANCELLED'
  checkedInAt: timestamp('checked_in_at'),
  checkedInBy: text('checked_in_by'),
  userId: integer('user_id').references(() => users.id), // Buyer/Owner account reference
  cashlessNumber: text('cashless_number').unique(), // RFID Cashless Band UID
  cashlessBalance: integer('cashless_balance').notNull().default(0), // Cashless balance in cents
  eventId: integer('event_id').references(() => events.id), // SaaS linked event
  ticketTypeId: integer('ticket_type_id').references(() => ticketTypes.id), // SaaS ticket type
  orderId: integer('order_id').references(() => orders.id), // SaaS parent order
  section: text('section'), // Reserved seat support
  row: text('row'),
  seat: text('seat'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tickets relations
export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  user: one(users, {
    fields: [tickets.userId],
    references: [users.id],
  }),
  event: one(events, {
    fields: [tickets.eventId],
    references: [events.id],
  }),
  ticketType: one(ticketTypes, {
    fields: [tickets.ticketTypeId],
    references: [ticketTypes.id],
  }),
  order: one(orders, {
    fields: [tickets.orderId],
    references: [orders.id],
  }),
  cashlessTransactions: many(cashlessTransactions),
}));

// RFID Cashless Transactions table
export const cashlessTransactions = pgTable('cashless_transactions', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').references(() => tickets.id).notNull(),
  time: timestamp('time').defaultNow(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // in cents
});

// Cashless transactions relations
export const cashlessTransactionsRelations = relations(cashlessTransactions, ({ one }) => ({
  ticket: one(tickets, {
    fields: [cashlessTransactions.ticketId],
    references: [tickets.id],
  }),
}));

// Audit logs / scan history table
export const checkInRecords = pgTable('check_in_records', {
  id: serial('id').primaryKey(),
  time: timestamp('time').defaultNow(),
  attendeeName: text('attendee_name').notNull(),
  ticketNumber: text('ticket_number').notNull(),
  ticketType: text('ticket_type').notNull(),
  entrance: text('entrance').notNull(),
  staffName: text('staff_name').notNull(),
  scannerName: text('scanner_name').notNull(),
  status: text('status').notNull(), // VALID, CHECKED_IN, INVALID, WRONG_EVENT, etc.
  businessId: integer('business_id').references(() => businesses.id), // multi-tenant log link
  eventId: integer('event_id').references(() => events.id), // event log link
});

// Check-ins relations
export const checkInRecordsRelations = relations(checkInRecords, ({ one }) => ({
  business: one(businesses, {
    fields: [checkInRecords.businessId],
    references: [businesses.id],
  }),
  event: one(events, {
    fields: [checkInRecords.eventId],
    references: [events.id],
  }),
}));

// Organiser business staff mappings
export const businessTeam = pgTable('business_team', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('CHECK_IN_STAFF'), // 'BUSINESS_OWNER' | 'BUSINESS_ADMIN' | 'EVENT_MANAGER' | 'FINANCE' | 'CHECK_IN_STAFF'
  createdAt: timestamp('created_at').defaultNow(),
});

// BusinessTeam relations
export const businessTeamRelations = relations(businessTeam, ({ one }) => ({
  business: one(businesses, {
    fields: [businessTeam.businessId],
    references: [businesses.id],
  }),
  user: one(users, {
    fields: [businessTeam.userId],
    references: [users.id],
  }),
}));

// Platform Admin / Internal team mappings
export const platformTeam = pgTable('platform_team', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('SUPPORT'), // 'SUPER_ADMIN' | 'ADMIN' | 'OPERATIONS' | 'FINANCE' | 'SUPPORT' | 'MARKETING' | 'ANALYST'
  createdAt: timestamp('created_at').defaultNow(),
});

// PlatformTeam relations
export const platformTeamRelations = relations(platformTeam, ({ one }) => ({
  user: one(users, {
    fields: [platformTeam.userId],
    references: [users.id],
  }),
}));

// Configurable global platform controls
export const platformSettings = pgTable('platform_settings', {
  id: serial('id').primaryKey(),
  platformName: text('platform_name').notNull().default('Howler Tickets'),
  logo: text('logo'),
  currency: text('currency').notNull().default('R'), // Rand 'R' or '$'
  platformFeePercent: integer('platform_fee_percent').notNull().default(3), // percentage e.g., 3%
  platformFixedFee: integer('platform_fixed_fee').notNull().default(10), // Rand 10
  supportEmail: text('support_email').notNull().default('support@howlertickets.com'),
  businessApprovalRequired: integer('business_approval_required').notNull().default(1), // 1: yes, 0: no
  eventApprovalRequired: integer('event_approval_required').notNull().default(0), // 1: yes, 0: no
});

// Payout tracking records
export const payouts = pgTable('payouts', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  amount: integer('amount').notNull(), // amount in dollars
  status: text('status').notNull().default('PENDING'), // PENDING, PROCESSING, PAID, FAILED
  reference: text('reference').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Payouts relations
export const payoutsRelations = relations(payouts, ({ one }) => ({
  business: one(businesses, {
    fields: [payouts.businessId],
    references: [businesses.id],
  }),
}));

// Real-time Platform & Tenant audit logging
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  businessId: integer('business_id').references(() => businesses.id),
  action: text('action').notNull(), // e.g. 'Admin approved business', 'Business created event'
  resourceType: text('resource_type').notNull(), // 'business', 'event', 'order', etc.
  resourceId: integer('resource_id'),
  metadata: text('metadata'), // Extra key values in stringified JSON
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Audit relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
  business: one(businesses, {
    fields: [auditLogs.businessId],
    references: [businesses.id],
  }),
}));
