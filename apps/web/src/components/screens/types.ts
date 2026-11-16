import type { Ack, Snapshot } from '@chaos/shared';
import type { Identity } from '../../lib/client';
import type { Lang, words, gameText } from '../../lib/i18n';

export type Words = (typeof words)['ar'];
export type GamesText = (typeof gameText)['ar'];
export type Command = (data: Record<string, unknown>, silent?: boolean) => Promise<Ack>;
export type Connection = 'connecting' | 'online' | 'offline';

export type ScreenProps = {
  lang: Lang;
  t: Words;
  games: GamesText;
};

export type RoomProps = ScreenProps & {
  state: Snapshot;
  identity: Identity | null;
  isHost: boolean;
  command: Command;
  leave: () => Promise<void>;
  invite: () => Promise<void>;
  copied: boolean;
};

/** Localised digits so Arabic copy reads naturally. */
export function num(value: number | string, lang: Lang) {
  return lang === 'ar' ? String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]) : String(value);
}
