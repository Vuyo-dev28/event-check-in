import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { carts, cartItems, events, ticketTypes, venues } from '../db/schema.ts';

export async function getCartState(sessionId: string, userId?: number | null) {
  let cart = null;
  if (userId) {
    [cart] = await db.select().from(carts).where(eq(carts.userId, userId));
  }
  if (!cart) {
    [cart] = await db.select().from(carts).where(eq(carts.sessionId, sessionId));
  }
  if (!cart) {
    return { cart: null, items: [], event: null };
  }

  const rows = await db
    .select({
      id: cartItems.id,
      ticketTypeId: cartItems.ticketTypeId,
      quantity: cartItems.quantity,
      reservedUntil: cartItems.reservedUntil,
      name: ticketTypes.name,
      description: ticketTypes.description,
      price: ticketTypes.price,
      priceCents: ticketTypes.priceCents,
      isFree: ticketTypes.isFree,
      remaining: ticketTypes.remaining,
      minPurchase: ticketTypes.minPurchase,
      maxPurchase: ticketTypes.maxPurchase,
    })
    .from(cartItems)
    .innerJoin(ticketTypes, eq(cartItems.ticketTypeId, ticketTypes.id))
    .where(eq(cartItems.cartId, cart.id));

  let eventDetails = null;
  if (cart.eventId) {
    const [evt] = await db
      .select({
        id: events.id,
        slug: events.slug,
        name: events.name,
        dateText: events.dateText,
        startTime: events.startTime,
        endTime: events.endTime,
        coverImage: events.coverImage,
        address: events.address,
        city: events.city,
        businessId: events.businessId,
        venueName: venues.name,
      })
      .from(events)
      .leftJoin(venues, eq(events.venueId, venues.id))
      .where(eq(events.id, cart.eventId));
    eventDetails = evt || null;
  }

  return {
    cart,
    items: rows.map((r) => ({
      ...r,
      priceCents: r.isFree ? 0 : (r.priceCents ?? r.price * 100),
    })),
    event: eventDetails,
  };
}

export async function saveCartState(params: {
  sessionId: string;
  userId?: number | null;
  eventId: number;
  promoCode?: string | null;
  items: Array<{ ticketTypeId: number; quantity: number }>;
}) {
  const [evt] = await db.select().from(events).where(eq(events.id, params.eventId));
  if (!evt) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

  const cleanItems = params.items
    .filter((i) => Number.isInteger(Number(i.ticketTypeId)) && Number(i.quantity) > 0)
    .map((i) => ({ ticketTypeId: Number(i.ticketTypeId), quantity: Math.min(20, Math.floor(Number(i.quantity))) }));

  return await db.transaction(async (tx) => {
    let cart = null;
    if (params.userId) {
      [cart] = await tx.select().from(carts).where(eq(carts.userId, params.userId));
    }
    if (!cart) {
      [cart] = await tx.select().from(carts).where(eq(carts.sessionId, params.sessionId));
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    if (!cart) {
      [cart] = await tx
        .insert(carts)
        .values({
          sessionId: params.sessionId,
          userId: params.userId || null,
          businessId: evt.businessId,
          eventId: evt.id,
          promoCode: params.promoCode || null,
          expiresAt,
          updatedAt: new Date(),
        })
        .returning();
    } else {
      [cart] = await tx
        .update(carts)
        .set({
          userId: params.userId ?? cart.userId,
          businessId: evt.businessId,
          eventId: evt.id,
          promoCode: params.promoCode !== undefined ? params.promoCode : cart.promoCode,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(carts.id, cart.id))
        .returning();
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));

    for (const item of cleanItems) {
      await tx.insert(cartItems).values({
        cartId: cart.id,
        ticketTypeId: item.ticketTypeId,
        quantity: item.quantity,
        reservedUntil: expiresAt,
      });
    }

    return cart;
  });
}

export async function mergeGuestCartIntoUser(sessionId: string, userId: number) {
  await db.transaction(async (tx) => {
    const [guestCart] = await tx.select().from(carts).where(eq(carts.sessionId, sessionId));
    const [userCart] = await tx.select().from(carts).where(eq(carts.userId, userId));

    if (!guestCart) return;

    if (!userCart) {
      await tx
        .update(carts)
        .set({ userId, updatedAt: new Date() })
        .where(eq(carts.id, guestCart.id));
      return;
    }

    if (guestCart.id === userCart.id) return;

    const guestItems = await tx.select().from(cartItems).where(eq(cartItems.cartId, guestCart.id));
    if (guestItems.length > 0) {
      // If guest actively selected tickets right before signing in, preserve guest selections
      if (guestCart.eventId && guestCart.eventId !== userCart.eventId) {
        await tx.delete(cartItems).where(eq(cartItems.cartId, userCart.id));
        await tx
          .update(carts)
          .set({
            eventId: guestCart.eventId,
            businessId: guestCart.businessId,
            promoCode: guestCart.promoCode || userCart.promoCode,
            updatedAt: new Date(),
          })
          .where(eq(carts.id, userCart.id));
        for (const gi of guestItems) {
          await tx.insert(cartItems).values({
            cartId: userCart.id,
            ticketTypeId: gi.ticketTypeId,
            quantity: gi.quantity,
            reservedUntil: gi.reservedUntil,
          });
        }
      } else {
        for (const gi of guestItems) {
          const [existing] = await tx
            .select()
            .from(cartItems)
            .where(and(eq(cartItems.cartId, userCart.id), eq(cartItems.ticketTypeId, gi.ticketTypeId)));
          if (existing) {
            await tx
              .update(cartItems)
              .set({ quantity: Math.min(20, Math.max(existing.quantity, gi.quantity)) })
              .where(eq(cartItems.id, existing.id));
          } else {
            await tx.insert(cartItems).values({
              cartId: userCart.id,
              ticketTypeId: gi.ticketTypeId,
              quantity: gi.quantity,
              reservedUntil: gi.reservedUntil,
            });
          }
        }
      }
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, guestCart.id));
    await tx.delete(carts).where(eq(carts.id, guestCart.id));
  });
}
