import { Calendar, Megaphone, Mic, FileText, type LucideIcon } from 'lucide-react';

/**
 * Kind → glyph, in one place.
 *
 * The desk's post rows and the editor's type control both draw the same three kinds, and a second
 * copy of this map is how a programme ends up with a calendar on one screen and a microphone on the
 * other. Keys are the server's `coach_post_kinds.key`; anything the taxonomy adds later falls back
 * to the document glyph rather than rendering nothing.
 */
export const KIND_ICON: Record<string, LucideIcon> = {
  program: Calendar,
  event: Mic,
  announcement: Megaphone,
};

export const kindIcon = (key: string): LucideIcon => KIND_ICON[key] ?? FileText;
