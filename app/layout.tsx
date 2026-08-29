import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';

import './globals.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Controle Financeiro | Top Haus',
  description:
    'Controle interno de notas fiscais, despesas e depósitos da Top Haus.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${montserrat.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
