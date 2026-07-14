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

// 대회 진행 방식 (0036)
export type TournamentFormat = 'group_knockout' | 'kdk' | 'team';

export const TOURNAMENT_FORMAT_LABELS: Record<TournamentFormat, string> = {
  group_knockout: '조별리그 + 토너먼트',
  kdk: 'KDK 개인전',
  team: '단체전',
};

export const TOURNAMENT_FORMAT_DESC: Record<TournamentFormat, string> = {
  group_knockout: '조별 예선을 거쳐 상위 진출자가 토너먼트 본선을 치릅니다.',
  kdk: '파트너를 바꿔가며 여러 경기를 치르고 개인 성적으로 순위를 매깁니다.',
  team: '팀(단체)끼리 여러 경기를 묶어 겨루고 팀 승수로 순위를 매깁니다.',
};

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
  format: TournamentFormat;
  status: TournamentStatus;
  group_count: number | null;
  advance_per_group: number | null;
  team_min_size: number; // 단체전: 팀당 최소 인원 (0037)
  tie_singles: number; // 단체전: 타이당 단식 매치 수 (0037)
  tie_doubles: number; // 단체전: 타이당 복식 매치 수 (0037)
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

// ---- 단체전 팀 + 진행 (0037/0039) ----
export type TeamStatus = 'pending' | 'approved' | 'rejected';

export type TournamentTeam = {
  id: string;
  tournament_id: string;
  name: string;
  captain_id: string;
  status: TeamStatus;
  seed: number | null;
  created_at: string;
};

export type TournamentTeamWithMembers = TournamentTeam & {
  members: { user_id: string; profiles: { id: string; nickname: string; skill_level: number; avatar_url: string | null; region: string } }[];
};

export type TieMatchKind = 'singles' | 'doubles';
export type TieSide = 'team1' | 'team2';

export type TournamentTie = {
  id: string;
  tournament_id: string;
  phase: MatchPhase;
  group_no: number | null;
  round_order: number | null;
  round_name: string | null;
  slot: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  status: 'scheduled' | 'done';
  court_id: string | null;
  created_at: string;
};

export type TieMatch = {
  id: string;
  tie_id: string;
  kind: TieMatchKind;
  slot: number;
  team1_players: string[];
  team2_players: string[];
  score1: number | null;
  score2: number | null;
  winner: TieSide | null;
  status: 'scheduled' | 'done';
  created_at: string;
};

// 코트 예약 시설(대회와 무관한 상시 예약 코트)
/** 면(코트) 1개 — 이름 + 바닥 종류 */
export type CourtUnit = { name: string; surface: string };

export type Court = {
  id: string;
  name: string;
  region: string;
  address: string;
  description: string;
  indoor: boolean;
  hourly_price: number;
  open_hour: number;
  close_hour: number;
  image_url: string | null;
  owner_id: string | null;
  latitude: number | null;
  longitude: number | null;
  court_units: CourtUnit[];
  amenities: string[];
  lessons: boolean;
  images: string[]; // 코트 사진 URL 배열
  auto_open_days: number; // 예약 자동 오픈 롤링 기간(일). 0=수동만
  created_at: string;
};

/** 코트 예약 가능일(오픈일) — 관리자가 연 날짜만 예약 가능 */
export type CourtOpenDay = {
  court_id: string;
  day: string; // YYYY-MM-DD
  created_at: string;
};

/** 코트 연대관(정기 대관) — 매주 반복 예약 차단 시간대 [start_hour, end_hour) */
export type CourtBlock = {
  id: string;
  court_id: string;
  weekday: number; // 0=일 ~ 6=토
  start_hour: number;
  end_hour: number;
  label: string;
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
  checked_in_at: string | null;
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

// 신고(moderation)
export type ReportStatus = 'open' | 'reviewed' | 'dismissed';
export type Report = {
  id: string;
  reporter_id: string;
  target_type: 'meetup' | 'club' | 'profile' | 'tournament';
  target_id: string;
  target_user_id: string | null;
  reason: string;
  detail: string;
  status: ReportStatus;
  created_at: string;
};
export type ReportWithNames = Report & {
  reporter: Pick<EntryProfile, 'id' | 'nickname'> | null;
  target_user: Pick<EntryProfile, 'id' | 'nickname'> | null;
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
      tournament_teams: {
        Row: TournamentTeam;
        Insert: Write<TournamentTeam> & { tournament_id: string; name: string; captain_id: string };
        Update: Write<TournamentTeam>;
        Relationships: [];
      };
      tournament_team_members: {
        Row: { team_id: string; user_id: string; created_at: string };
        Insert: { team_id: string; user_id: string };
        Update: Write<{ team_id: string; user_id: string; created_at: string }>;
        Relationships: [];
      };
      tournament_ties: {
        Row: TournamentTie;
        Insert: Write<TournamentTie> & { tournament_id: string };
        Update: Write<TournamentTie>;
        Relationships: [];
      };
      tie_matches: {
        Row: TieMatch;
        Insert: Write<TieMatch> & { tie_id: string; kind: TieMatchKind };
        Update: Write<TieMatch>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Write<AuditLog>;
        Update: Write<AuditLog>;
        Relationships: [];
      };
      courts: {
        Row: Court;
        Insert: Write<Court> & { name: string };
        Update: Write<Court>;
        Relationships: [];
      };
      court_open_days: {
        Row: CourtOpenDay;
        Insert: { court_id: string; day: string };
        Update: Write<CourtOpenDay>;
        Relationships: [];
      };
      court_blocks: {
        Row: CourtBlock;
        Insert: { court_id: string; weekday: number; start_hour: number; end_hour: number } & Write<CourtBlock>;
        Update: Write<CourtBlock>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Write<Report>;
        Update: Write<Report>;
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
