import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Registered users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Auth UID (Firebase or local scrypt user)
  email: text('email').notNull(),
  role: text('role').notNull().default('attendee'), // 'attendee' | 'organizer' | 'superadmin'
  firstName: text('first_name'),
  lastName: text('last_name'),
  phone: text('phone'),
  city: text('city'),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  emailVerified: integer('email_verified').notNull().default(0),
  verificationToken: text('verification_token'),
  resetToken: text('reset_token'),
  resetTokenExpires: timestamp('reset_token_expires'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  tickets: many(tickets),
  businessMemberships: many(businessTeam),
  platformRoles: many(platformTeam),
  orders: many(orders),
  notifications: many(notifications),
  favourites: many(customerFavourites),
}));

// Businesses / Organisers Table
export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug'),
  type: text('business_type').notNull(), // 'Nightclub' | 'Festival' | 'Concert' | etc.
  contactPerson: text('contact_person'),
  email: text('email').notNull().unique(),
  phone: text('phone'),
  country: text('country'),
  address: text('address'),
  website: text('website'),
  logo: text('logo'),
  description: text('description'),
  registrationNumber: text('registration_number'),
  taxNumber: text('tax_number'),
  bankName: text('bank_name'),
  bankAccountNumber: text('bank_account_number'),
  bankBranchCode: text('bank_branch_code'),
  accountHolderName: text('account_holder_name'),
  payoutEmail: text('payout_email'),
  agreementAcceptedAt: timestamp('agreement_accepted_at'),
  verificationStatus: text('verification_status').notNull().default('PENDING'), // PENDING, VERIFIED, REJECTED
  rejectionReason: text('rejection_reason'),
  onboardingStep: integer('onboarding_step').notNull().default(1),
  onboardingDraft: text('onboarding_draft'), // JSON draft for save & resume
  status: text('status').notNull().default('PENDING'), // PENDING, UNDER_REVIEW, APPROVED, ACTIVE, REJECTED, SUSPENDED
  commissionBps: integer('commission_bps'), // Nullable override in basis points (500 = 5%)
  commissionFixedCents: integer('commission_fixed_cents'),
  grossSales: integer('gross_sales').notNull().default(0), // Legacy dollars column
  platformFees: integer('platform_fees').notNull().default(0), // Legacy dollars column
  refundedAmt: integer('refunded_amt').notNull().default(0), // Legacy dollars column
  pendingPayout: integer('pending_payout').notNull().default(0), // Legacy dollars column
  paidPayout: integer('paid_payout').notNull().default(0), // Legacy dollars column
  grossSalesCents: integer('gross_sales_cents').notNull().default(0),
  platformFeesCents: integer('platform_fees_cents').notNull().default(0),
  refundedAmtCents: integer('refunded_amt_cents').notNull().default(0),
  pendingPayoutCents: integer('pending_payout_cents').notNull().default(0),
  paidPayoutCents: integer('paid_payout_cents').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const businessesRelations = relations(businesses, ({ many }) => ({
  venues: many(venues),
  events: many(events),
  team: many(businessTeam),
  orders: many(orders),
  payouts: many(payouts),
  auditLogs: many(auditLogs),
  verifications: many(businessVerifications),
  ledgerEntries: many(financialLedger),
  invitations: many(staffInvitations),
}));

// Business Verifications Table
export const businessVerifications = pgTable('business_verifications', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  registrationDocUrl: text('registration_doc_url'),
  idDocUrl: text('id_doc_url'),
  bankProofUrl: text('bank_proof_url'),
  notes: text('notes'),
  status: text('status').notNull().default('PENDING'), // PENDING, UNDER_REVIEW, VERIFIED, REJECTED
  reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Event Categories
export const eventCategories = pgTable('event_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  icon: text('icon'),
  createdAt: timestamp('created_at').defaultNow(),
});

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
  slug: text('slug'),
  name: text('name').notNull(),
  description: text('description'),
  coverImage: text('cover_image'),
  bannerImages: text('banner_images'), // JSON array of image URLs
  logo: text('logo'),
  address: text('address'),
  city: text('city'),
  province: text('province'),
  country: text('country'),
  isOnline: integer('is_online').notNull().default(0),
  onlineUrl: text('online_url'),
  mapLat: text('map_lat'),
  mapLng: text('map_lng'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  refundPolicy: text('refund_policy'),
  termsAndConditions: text('terms_and_conditions'),
  isFeatured: integer('is_featured').notNull().default(0),
  dateText: text('date_text').notNull(),
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  startTime: text('start_time'),
  endTime: text('end_time'),
  timezone: text('timezone'),
  category: text('category').notNull(),
  ageRestriction: text('age_restriction'),
  commissionBps: integer('commission_bps'),
  commissionFixedCents: integer('commission_fixed_cents'),
  status: text('status').notNull().default('DRAFT'), // DRAFT, PENDING_APPROVAL, PUBLISHED, ON_SALE, SOLD_OUT, COMPLETED, CANCELLED, SUSPENDED
  createdAt: timestamp('created_at').defaultNow(),
});

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
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price').notNull(), // Legacy / display currency unit
  priceCents: integer('price_cents'), // Smallest currency unit (cents)
  isFree: integer('is_free').notNull().default(0),
  quantity: integer('quantity').notNull(),
  remaining: integer('remaining').notNull(),
  reserved: integer('reserved').notNull().default(0),
  saleStart: timestamp('sale_start'),
  saleEnd: timestamp('sale_end'),
  minPurchase: integer('min_purchase').default(1),
  maxPurchase: integer('max_purchase').default(8),
  perCustomerLimit: integer('per_customer_limit').default(8),
  status: text('status').notNull().default('ACTIVE'), // ACTIVE, INACTIVE
  isReserved: integer('is_reserved').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ticketTypesRelations = relations(ticketTypes, ({ one, many }) => ({
  event: one(events, {
    fields: [ticketTypes.eventId],
    references: [events.id],
  }),
  orderItems: many(orderItems),
}));

// Server-side Carts & Reservations (prevents overselling and preserves cart across auth)
export const carts = pgTable('carts', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull().unique(),
  userId: integer('user_id').references(() => users.id),
  businessId: integer('business_id').references(() => businesses.id),
  eventId: integer('event_id').references(() => events.id),
  promoCode: text('promo_code'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id').references(() => carts.id, { onDelete: 'cascade' }).notNull(),
  ticketTypeId: integer('ticket_type_id').references(() => ticketTypes.id).notNull(),
  quantity: integer('quantity').notNull(),
  reservedUntil: timestamp('reserved_until'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Orders table for processing payments & purchases
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userId: integer('user_id').references(() => users.id), // Nullable for guest purchases
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  buyerName: text('buyer_name').notNull(),
  buyerEmail: text('buyer_email').notNull(),
  buyerPhone: text('buyer_phone'),
  currency: text('currency').notNull().default('ZAR'),
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  serviceFee: integer('service_fee').notNull(),
  total: integer('total').notNull(),
  platformFeeCut: integer('platform_fee_cut').notNull().default(0),
  subtotalCents: integer('subtotal_cents'),
  discountCents: integer('discount_cents').default(0),
  serviceFeeCents: integer('service_fee_cents'),
  totalCents: integer('total_cents'),
  platformFeeCutCents: integer('platform_fee_cut_cents').default(0),
  gatewayFeeCents: integer('gateway_fee_cents').default(0),
  businessEarningsCents: integer('business_earnings_cents').default(0),
  commissionBpsSnapshot: integer('commission_bps_snapshot'),
  commissionFixedCentsSnapshot: integer('commission_fixed_cents_snapshot'),
  paymentProvider: text('payment_provider'),
  paymentReference: text('payment_reference'),
  paymentStatus: text('payment_status').default('PENDING'), // PENDING, PROCESSING, SUCCESSFUL, FAILED, CANCELLED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED
  reservationExpiresAt: timestamp('reservation_expires_at'),
  claimedAt: timestamp('claimed_at'),
  status: text('status').notNull().default('PENDING'), // PENDING, PAID, REFUNDED, PARTIALLY_REFUNDED, CANCELLED, FAILED, EXPIRED
  promoCode: text('promo_code'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

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
  payments: many(payments),
  refunds: many(refunds),
}));

// Individual purchased order items mapping
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  ticketTypeId: integer('ticket_type_id').references(() => ticketTypes.id).notNull(),
  ticketTypeName: text('ticket_type_name'),
  quantity: integer('quantity').notNull(),
  price: integer('price').notNull(),
  priceCents: integer('price_cents'),
});

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

// Tickets table
export const tickets = pgTable('tickets', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(), // QR validation token
  ticketNumber: text('ticket_number').notNull().unique(),
  buyerName: text('buyer_name'),
  buyerEmail: text('buyer_email'),
  attendeeName: text('attendee_name').notNull(),
  attendeeEmail: text('attendee_email').notNull(),
  type: text('type').notNull(),
  eventName: text('event_name').notNull(),
  status: text('status').notNull().default('VALID'), // 'PENDING_PAYMENT' | 'VALID' | 'CHECKED_IN' | 'INVALID' | 'REFUNDED' | 'CANCELLED'
  checkedInAt: timestamp('checked_in_at'),
  checkedInBy: text('checked_in_by'),
  userId: integer('user_id').references(() => users.id), // Nullable for guest orders
  cashlessNumber: text('cashless_number').unique(),
  cashlessBalance: integer('cashless_balance').notNull().default(0),
  eventId: integer('event_id').references(() => events.id),
  ticketTypeId: integer('ticket_type_id').references(() => ticketTypes.id),
  orderId: integer('order_id').references(() => orders.id),
  orderItemId: integer('order_item_id').references(() => orderItems.id),
  qrCodeUrl: text('qr_code_url'),
  pdfUrl: text('pdf_url'),
  purchasedAt: timestamp('purchased_at').defaultNow(),
  section: text('section'),
  row: text('row'),
  seat: text('seat'),
  createdAt: timestamp('created_at').defaultNow(),
});

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

// Payments table
export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  provider: text('provider').notNull(), // 'paystack' | 'peach' | 'payfast' | 'sandbox'
  reference: text('reference').notNull().unique(),
  idempotencyKey: text('idempotency_key').unique(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  gatewayFeeCents: integer('gateway_fee_cents').notNull().default(0),
  status: text('status').notNull().default('PENDING'), // PENDING, PROCESSING, SUCCESSFUL, FAILED, CANCELLED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED, DISPUTED
  paymentMethod: text('payment_method'),
  authorizationUrl: text('authorization_url'),
  rawResponse: text('raw_response'),
  verifiedAt: timestamp('verified_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  business: one(businesses, {
    fields: [payments.businessId],
    references: [businesses.id],
  }),
}));

// Incoming payment webhooks (for idempotency and auditing)
export const paymentWebhooks = pgTable('payment_webhooks', {
  id: serial('id').primaryKey(),
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  reference: text('reference').notNull(),
  payload: text('payload').notNull(),
  signature: text('signature'),
  signatureValid: integer('signature_valid').notNull().default(0),
  processed: integer('processed').notNull().default(0),
  processingError: text('processing_error'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Refunds table
export const refunds = pgTable('refunds', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  ticketId: integer('ticket_id').references(() => tickets.id),
  requestedByUserId: integer('requested_by_user_id').references(() => users.id),
  requesterEmail: text('requester_email').notNull(),
  reason: text('reason').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull().default('REQUESTED'), // REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED, FAILED
  reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id),
  reviewNotes: text('review_notes'),
  gatewayRefundId: text('gateway_refund_id'),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const refundsRelations = relations(refunds, ({ one }) => ({
  order: one(orders, {
    fields: [refunds.orderId],
    references: [orders.id],
  }),
  business: one(businesses, {
    fields: [refunds.businessId],
    references: [businesses.id],
  }),
  ticket: one(tickets, {
    fields: [refunds.ticketId],
    references: [tickets.id],
  }),
}));

// Commission Rules
export const commissionRules = pgTable('commission_rules', {
  id: serial('id').primaryKey(),
  scope: text('scope').notNull().default('PLATFORM'), // 'PLATFORM' | 'BUSINESS' | 'EVENT'
  businessId: integer('business_id').references(() => businesses.id),
  eventId: integer('event_id').references(() => events.id),
  commissionBps: integer('commission_bps').notNull().default(500), // 500 = 5.00%
  fixedFeeCents: integer('fixed_fee_cents').notNull().default(0),
  bookingFeeBps: integer('booking_fee_bps').notNull().default(350), // 350 = 3.50% customer service fee
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

// Immutable Financial Ledger
export const financialLedger = pgTable('financial_ledger', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  orderId: integer('order_id').references(() => orders.id),
  paymentId: integer('payment_id').references(() => payments.id),
  refundId: integer('refund_id').references(() => refunds.id),
  payoutId: integer('payout_id').references(() => payouts.id),
  entryType: text('entry_type').notNull(), // GROSS_SALE, PLATFORM_COMMISSION, GATEWAY_FEE, BUSINESS_EARNING, REFUND_REVERSAL, PAYOUT_DEBIT
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Promo Codes
export const promoCodes = pgTable('promo_codes', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id),
  eventId: integer('event_id').references(() => events.id),
  code: text('code').notNull().unique(),
  discountPercent: integer('discount_percent').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  active: integer('active').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

// Notifications (Email + In-app with retry support)
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  email: text('email'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  channel: text('channel').notNull().default('IN_APP'), // IN_APP, EMAIL
  status: text('status').notNull().default('PENDING'), // PENDING, SENT, FAILED
  retryCount: integer('retry_count').notNull().default(0),
  lastError: text('last_error'),
  readAt: timestamp('read_at'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Staff Invitations
export const staffInvitations = pgTable('staff_invitations', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('CHECK_IN_STAFF'),
  token: text('token').notNull().unique(),
  status: text('status').notNull().default('PENDING'), // PENDING, ACCEPTED, REVOKED, EXPIRED
  invitedByUserId: integer('invited_by_user_id').references(() => users.id),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Customer Favourites
export const customerFavourites = pgTable('customer_favourites', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  eventId: integer('event_id').references(() => events.id).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// RFID Cashless Transactions table
export const cashlessTransactions = pgTable('cashless_transactions', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').references(() => tickets.id).notNull(),
  time: timestamp('time').defaultNow(),
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // in cents
});

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
  status: text('status').notNull(),
  businessId: integer('business_id').references(() => businesses.id),
  eventId: integer('event_id').references(() => events.id),
  ticketId: integer('ticket_id').references(() => tickets.id),
  scannerUserId: integer('scanner_user_id').references(() => users.id),
});

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

export const platformTeamRelations = relations(platformTeam, ({ one }) => ({
  user: one(users, {
    fields: [platformTeam.userId],
    references: [users.id],
  }),
}));

// Configurable global platform controls
export const platformSettings = pgTable('platform_settings', {
  id: serial('id').primaryKey(),
  platformName: text('platform_name').notNull().default('BookMyte'),
  logo: text('logo'),
  currency: text('currency').notNull().default('R'),
  platformFeePercent: integer('platform_fee_percent').notNull().default(5),
  platformFixedFee: integer('platform_fixed_fee').notNull().default(10),
  supportEmail: text('support_email').notNull().default('support@bookmyte.com'),
  businessApprovalRequired: integer('business_approval_required').notNull().default(1),
  eventApprovalRequired: integer('event_approval_required').notNull().default(0),
});

// Payout tracking records
export const payouts = pgTable('payouts', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id).notNull(),
  amount: integer('amount').notNull(),
  amountCents: integer('amount_cents'),
  currency: text('currency').notNull().default('ZAR'),
  status: text('status').notNull().default('PENDING'), // PENDING, PROCESSING, PAID, FAILED
  reference: text('reference').notNull(),
  notes: text('notes'),
  processedByUserId: integer('processed_by_user_id').references(() => users.id),
  processedAt: timestamp('processed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

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
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: integer('resource_id'),
  previousValue: text('previous_value'),
  newValue: text('new_value'),
  metadata: text('metadata'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

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
