import { z } from 'zod';
import { genderEnum } from '@constella/shared';

export const orbitFilterSchema = z.object({
  minAge: z.number().int().min(18).max(99).optional(),
  maxAge: z.number().int().min(18).max(99).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  gender: genderEnum.optional(),
}).refine(
  ({ minAge, maxAge }) => minAge === undefined || maxAge === undefined || minAge <= maxAge,
  { path: ['maxAge'], message: 'Maximum age must be greater than or equal to minimum age.' },
);

export const hasOrbitFilters = (filters: z.infer<typeof orbitFilterSchema>) =>
  Object.values(filters).some((value) => value !== undefined);
