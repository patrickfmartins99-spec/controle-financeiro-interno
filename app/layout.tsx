import type { Metadata } from 'next';
import { Geist } from 'next/font/google';

import './globals.css';

const geist = Geist({ variable: '--font-geist', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Controle Financeiro | Top Haus',
  description:
    'Controle interno de notas fiscais, despesas e depósitos da Top Haus.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geist.variable} antialiased`}>{children}</body>
    </html>
  );
}
