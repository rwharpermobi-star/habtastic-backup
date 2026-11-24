import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { answerRationale, RATIONALE_COPY, subscribeRationale, type RationaleKind } from '@/lib/permissionRationale';

export default function PermissionRationaleHost() {
  const [kind, setKind] = useState<RationaleKind | null>(null);
  useEffect(() => subscribeRationale((req) => setKind(req?.kind ?? null)), []);
  const copy = kind ? RATIONALE_COPY[kind] : null;
  return (
    <AlertDialog open={!!copy} onOpenChange={(open) => { if (!open) answerRationale(false); }}>
      <AlertDialogContent className="rounded-card">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => answerRationale(false)}>Not now</AlertDialogCancel>
          <AlertDialogAction onClick={() => answerRationale(true)}>{copy?.confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
