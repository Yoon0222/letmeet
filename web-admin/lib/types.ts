// 모바일 앱(src/lib/types.ts)과 공유하는 대회 관련 도메인 타입.
// 별도 앱이라 필요한 부분만 복제한다. 스키마 변경 시 양쪽을 함께 갱신할 것.

export type UserRole = 'player' | 'organizer' | 'court_manager' | 'super_admin';

export type Profile = {
  id: string;
  nickname: string;
  role: UserRole;
  region: string;
  skill_level: number;
  avatar_url: string | null;
  created_at: string;
};

export type TournamentStatus = 'registration' | 'ongoing' | 'finished' | 'cancelled';
export type EntryStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'waitlist';
export type Discipline = 'singles' | 'doubles';

export type Tournament = {
  id: string;
  organizer_id: string;
  title: string;
  description: string;
  region: string;
  venue: string;
  start_at: string;
  registration_deadline: string | null;
  max_participants: number;
  skill_min: number;
  skill_max: number;
  fee: number;
  discipline: Discipline;
  format: string;
  status: TournamentStatus;
  group_count: number | null;
  advance_per_group: number | null;
  created_at: string;
};

export type MatchPhase = 'group' | 'knockout';

export type TournamentMatch = {
  id: string;
  tournament_id: string;
  phase: MatchPhase;
  group_no: number | null;
  round_order: number | null;
  round_name: string | null;
  slot: number;
  entry1_id: string | null;
  entry2_id: string | null;
  score1: number | null;
  score2: number | null;
  winner_id: string | null;
  status: 'scheduled' | 'done';
  court_id: string | null;
  court_confirmed: boolean;
  created_at: string;
};

export type TournamentCourt = {
  id: string;
  tournament_id: string;
  name: string;
  indoor: boolean;
  sort: number;
  created_at: string;
};

export type TournamentWithCounts = Tournament & {
  organizer_nickname: string;
  organizer_avatar_url: string | null;
  approved_count: number;
  pending_count: number;
};

export type TournamentEntry = {
  tournament_id: string;
  user_id: string;
  status: EntryStatus;
  partner_name: string | null;
  partner_id: string | null;
  seed: number | null;
  created_at: string;
};

export type EntryProfile = {
  id: string;
  nickname: string;
  skill_level: number;
  avatar_url: string | null;
  region: string;
};

export type TournamentEntryWithProfile = TournamentEntry & {
  profiles: EntryProfile;
  partner: EntryProfile | null;
};

export type AuditLog = {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

export type AuditLogWithActor = AuditLog & {
  actor: Pick<EntryProfile, 'id' | 'nickname'> | null;
};

type Write<T> = Partial<T>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Write<Profile> & { id: string; nickname: string };
        Update: Write<Profile>;
        Relationships: [];
      };
      tournaments: {
        Row: Tournament;
        Insert: Write<Tournament> & { organizer_id: string; title: string; start_at: string };
        Update: Write<Tournament>;
        Relationships: [];
      };
      tournament_entries: {
        Row: TournamentEntry;
        Insert: { tournament_id: string; user_id: string } & Write<TournamentEntry>;
        Update: Write<TournamentEntry>;
        Relationships: [];
      };
      tournament_matches: {
        Row: TournamentMatch;
        Insert: Write<TournamentMatch> & { tournament_id: string; phase: MatchPhase };
        Update: Write<TournamentMatch>;
        Relationships: [];
      };
      tournament_courts: {
        Row: TournamentCourt;
        Insert: Write<TournamentCourt> & { tournament_id: string; name: string };
        Update: Write<TournamentCourt>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Write<AuditLog>;
        Update: Write<AuditLog>;
        Relationships: [];
      };
    };
    Views: {
      tournaments_with_counts: {
        Row: TournamentWithCounts;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
