import Link from 'next/link';
import { Logo } from '@/components/brand';

// Página 404 propia: la de Next.js trae un <style> inline sin nonce que la CSP bloquearía.
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-uvg-deep px-6 text-center text-white">
      <div className="flex flex-col items-center gap-5">
        <Logo className="h-8 w-auto" />
        <div>
          <p className="font-mono text-sm text-uvg-mint">404</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Página no encontrada</h1>
          <p className="mt-3 text-sm text-white/65">La dirección que buscas no existe o fue movida.</p>
        </div>
        <Link href="/" className="text-sm font-medium text-uvg-mint hover:underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
