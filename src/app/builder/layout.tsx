import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'ThatTeslaLightshow Builder' },
};

export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
