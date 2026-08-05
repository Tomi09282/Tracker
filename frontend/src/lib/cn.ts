import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind conflict resolution.
 *
 * The conflict resolution is what matters: a caller passing `px-6` must actually override the
 * primitive's `px-4` instead of both landing in the class list and the cascade deciding by
 * source order. Without it, component composition silently stops working.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
