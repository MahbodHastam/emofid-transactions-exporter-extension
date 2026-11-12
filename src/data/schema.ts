import { z } from 'zod';

export const rawTxSchema = z.looseObject({
  voucherDate: z.union([z.string(), z.number()]),
  description: z.string().nullish(),
  voucherDetailDescription: z.string().nullish(),
  amount: z.union([z.number(), z.string()]),
  voucherType: z.union([z.string(), z.number()]).nullish(),
  remain: z.union([z.number(), z.string()]).nullish(),
});

export const pageSchema = z.object({
  data: z.object({ items: z.array(rawTxSchema) }),
});

export type RawTx = z.infer<typeof rawTxSchema>;
