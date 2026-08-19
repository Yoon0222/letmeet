import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

export type CourtReservationResult = { ok: true; free?: boolean } | { ok: false; reason: 'slot' | 'error'; message?: string };

export async function createCourtReservation(args: {
  court: Pick<Court, 'id' | 'hourly_price'>;
  uid: string;
  slotDate: string;
  hours: number[];
  courtUnit: string;
}): Promise<CourtReservationResult> {
  const { court, uid, slotDate, hours, courtUnit } = args;

  const { error } = await supabase.from('court_reservations').insert(
    hours.map((hour) => ({
      court_id: court.id,
      user_id: uid,
      court_unit: courtUnit,
      slot_date: slotDate,
      hour,
      payment_id: null,
      status: 'reserved',
      expires_at: null,
    })),
  );

  if (error) {
    return { ok: false, reason: /duplicate|unique/i.test(error.message) ? 'slot' : 'error', message: error.message };
  }

  return { ok: true, free: court.hourly_price <= 0 };
}
