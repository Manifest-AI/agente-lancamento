import { ProtectedRoute } from '@/components/ProtectedRoute';
import ReservationsPageContent from './_components/ReservationsPageContent';

export const dynamic = 'force-dynamic';

export default function ReservasPage() {
  return (
    <ProtectedRoute>
      <ReservationsPageContent />
    </ProtectedRoute>
  );
}
