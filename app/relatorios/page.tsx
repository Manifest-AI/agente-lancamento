import { ProtectedRoute } from '@/components/ProtectedRoute';
import RoamingListPageContent from './_components/RoamingListPageContent';

export const dynamic = 'force-dynamic';

export default function RelatoriosPage() {
  return (
    <ProtectedRoute>
      <RoamingListPageContent />
    </ProtectedRoute>
  );
}
