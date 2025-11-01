import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agente de Lançamento',
  description: 'MVP para automação de lançamentos',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
