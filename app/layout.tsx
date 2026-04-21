import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BypassTube - Pro YT Downloader',
  description: 'A sophisticated, high-speed YouTube video and playlist downloader with bot-bypass capabilities.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="overscroll-none bg-neutral-950">
        {children}
      </body>
    </html>
  );
}
