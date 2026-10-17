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

/**
 * Genders allowed by the viewer's own "looking for" preference, narrowed by an
 * optional VIP filter. Returns an empty array when nothing matches — callers must
 * treat that as "no candidates" instead of building an `IN ()` SQL clause.
 */
export const resolveTargetGenders = (
  lookingFor: readonly string[] | null | undefined,
  filterGender?: z.infer<typeof orbitFilterSchema>['gender'],
): string[] => {
  const preference = lookingFor ?? [];
  if (!filterGender) return [...preference];
  return preference.includes(filterGender) ? [filterGender] : [];
};
