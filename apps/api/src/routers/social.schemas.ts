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
 * Genders allowed for Orbit discovery.
 * - When no VIP gender filter is applied: returns the viewer's own "looking for"
 *   preference (default behaviour).
 * - When a VIP gender filter is applied: returns only that filter gender — it
 *   overrides the viewer's preference because the user explicitly asked to see
 *   that gender.
 */
export const resolveTargetGenders = (
  lookingFor: readonly string[] | null | undefined,
  filterGender?: z.infer<typeof orbitFilterSchema>['gender'],
): string[] => {
  if (filterGender) return [filterGender];
  return lookingFor ? [...lookingFor] : [];
};
