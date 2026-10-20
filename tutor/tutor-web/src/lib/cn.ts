import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** rare-ui 的 cn() —— clsx + tailwind-merge，条件类名与 Tailwind 冲突消解 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
