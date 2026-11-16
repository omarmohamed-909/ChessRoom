import type { Metadata } from 'next';
import '@fontsource-variable/cairo/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './globals.css';
import './arcade.css';
export const metadata: Metadata = {
  title: 'CHAOS ROOM — أوضة الفوضى',
  description:
    'قوانينكم. فوضاكم. لعبة حفلات سريعة ليك ولصحابك. صوّت برجليك، اقلب القاعدة، والعب تاني.',
  applicationName: 'CHAOS ROOM',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
