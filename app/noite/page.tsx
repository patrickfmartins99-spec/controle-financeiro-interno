import type { Metadata } from 'next';

import { ControlApp } from '@/components/control-app';

export const metadata: Metadata = {
  title: 'Turno Noite | Controle Financeiro Top Haus',
};

export default function NightShift() {
  return <ControlApp shift="night" />;
}
