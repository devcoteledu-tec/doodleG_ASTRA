import { z } from 'zod';
export const shippingSchema = z.object({
  name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(255),
  phone: z.string().trim().regex(/^(?:\+91[ -]?)?[6-9]\d{9}$/, 'Enter a valid Indian mobile number.'),
  address: z.string().trim().min(5).max(500), city: z.string().trim().min(1).max(100),
  zip: z.string().regex(/^[1-9]\d{5}$/), country: z.literal('India').optional(),
});
export const checkoutItemSchema = z.object({
  productId: z.string().uuid(), quantity: z.number().int().min(1).max(50),
  selectedColor: z.string().max(100).nullable().optional(), selectedSize: z.string().max(100).nullable().optional(),
});
export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(100), shipping: shippingSchema,
  couponCode: z.string().trim().max(40).nullable().optional(), giftWrap: z.boolean().optional(),
  flexibleChoice: z.enum(['online', 'cod']).default('cod'),
  idempotencyKey: z.string().uuid(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
