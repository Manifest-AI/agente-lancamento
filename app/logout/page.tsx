'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LogoutPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  useEffect(() => {
    const performLogout = async () => {
      await signOut();
      router.replace('/login');
    };

    void performLogout();
  }, [router, signOut]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="rounded-2xl bg-white px-8 py-6 text-center text-sm text-slate-600 shadow-xl">
        Encerrando sessão...
      </div>
    </main>
  );
}
