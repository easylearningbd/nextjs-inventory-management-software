import { z } from 'zod';
import { PERMISSION_SET } from '@/lib/permissions';

export const roleSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(100, 'Name is too long.'),
  permissions: z
    .array(z.string())
    .refine((arr) => arr.every((p) => PERMISSION_SET.has(p)), {
      message: 'One or more permissions are invalid.',
    }),
});

export type RoleState = { error?: string; success?: boolean };
