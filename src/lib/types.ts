// ============================================================
// 도메인 타입 + Supabase Database 타입 (수동 정의)
// ============================================================

export type UserRole = 'player' | 'organizer' | 'court_manager' | 'super_admin';

export type PlayStyle = 'aggressive' | 'control' | 'all';

export const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  aggressive: '공격형',
  control: '컨트롤형',
  all: '올라운드',
};

export type MeetupStatus = 'open' | 'closed' | 'cancelled';

export type MeetupParticipantStatus = 'pending' | 'approved';

// NOTE: Supabase 의 GenericTable 제약(Record<string, unknown>)을 만족하려면
// interface 가 아니라 type 별칭이어야 한다 (암묵적 인덱스 시그니처).
export type Profile = {
  id: string;
  nickname: string;
  skill_level: number;
  region: string;
  play_style: PlayStyle;
  bio: string;
  avatar_url: string | null;
  push_token: string | null;
  // DUPR 연동 대비 (추후 파트너 API 로 검증)
  dupr_id: string | null;
  dupr_rating: number | null;
  dupr_verified: boolean;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type Meetup = {
  id: string;
  host_id: string;
  title: string;
  description: string;
  location_name: string;
  region: string;
  start_time: string;
  duration_min: number;
  skill_min: number;
  skill_max: number;
  max_players: number;
  fee: number; // 게스트비(원), 0=무료 (0033)
  require_approval: boolean; // 참가 신청 승인 필요 여부 (0033)
  image_url: string | null; // 코트/장소 사진 (0034)
  status: MeetupStatus;
  created_at: string;
};

/** meetups_with_counts 뷰 결과 */
export type MeetupWithCounts = Meetup & {
  host_nickname: string;
  host_avatar_url: string | null;
  participant_count: number;
};

export type Participant = {
  meetup_id: string;
  user_id: string;
  status: MeetupParticipantStatus; // 'pending' | 'approved' (0033)
  joined_at: string;
};

/** 참가자 + 프로필 (조인 결과) */
export type ParticipantWithProfile = Participant & {
  profiles: Pick<Profile, 'id' | 'nickname' | 'skill_level' | 'avatar_url' | 'region'>;
};

// ---- 클럽(동호회) ----
export type ClubRole = 'owner' | 'member';

export type ClubMemberStatus = 'pending' | 'approved';

export type Club = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  region: string;
  image_url: string | null; // 클럽 대표 사진 (0031)
  require_approval: boolean; // 가입 승인 필요 여부 (0032)
  created_at: string;
};

/** clubs_with_counts 뷰 결과 */
export type ClubWithCounts = Club & {
  owner_nickname: string;
  owner_avatar_url: string | null;
  member_count: number;
};

export type ClubMember = {
  club_id: string;
  user_id: string;
  role: ClubRole;
  status: ClubMemberStatus; // 'pending' | 'approved' (0032)
  joined_at: string;
};

/** 멤버 + 프로필 (조인 결과) */
export type ClubMemberWithProfile = ClubMember & {
  profiles: Pick<Profile, 'id' | 'nickname' | 'skill_level' | 'avatar_url' | 'region'>;
};

// ---- 대회(tournaments) ----
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

// ---- 단체전 팀 (0037) ----
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

export type TournamentTeamMember = {
  team_id: string;
  user_id: string;
  created_at: string;
};

/** 팀 + 팀원 프로필 (조인 결과) */
export type TournamentTeamWithMembers = TournamentTeam & {
  members: { user_id: string; profiles: PartnerProfile }[];
};

/** tournaments_with_counts 뷰 결과 */
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

/** 파트너/참가자 프로필 요약 */
export type PartnerProfile = Pick<Profile, 'id' | 'nickname' | 'skill_level' | 'avatar_url' | 'region'>;

/** 참가신청 + 프로필 (조인 결과) */
export type TournamentEntryWithProfile = TournamentEntry & {
  profiles: PartnerProfile;
  partner: PartnerProfile | null;
};

// ---- 대진(tournament_matches) ----
export type MatchPhase = 'group' | 'knockout';
export type MatchStatus = 'scheduled' | 'done';

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
  status: MatchStatus;
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

// ---- 코트 예약 (courts / court_reservations) ----
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

/** 코트 예약 가능일 — 관리자가 연 날짜만 예약 가능 */
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

export type ReservationStatus = 'reserved' | 'cancelled';

export type CourtReservation = {
  id: string;
  court_id: string;
  user_id: string;
  court_unit: string; // 면(코트) 이름. '' = 시설 단위
  slot_date: string; // YYYY-MM-DD
  hour: number;
  status: ReservationStatus;
  payment_id: string | null; // null = 무료/구제도(결제 없이 확정)
  created_at: string;
};

// ---- 코트 예약 결제 (court_payments) ----
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'canceled' | 'refunded';

export type CourtPayment = {
  id: string;
  order_id: string;
  user_id: string;
  court_id: string;
  court_unit: string;
  slot_date: string;
  hours: number[];
  amount: number;
  status: PaymentStatus;
  provider: string; // portone | toss | mock
  provider_tx: string | null;
  created_at: string;
  paid_at: string | null;
};

/** 예약 + 코트 (내 예약 조인 결과) */
export type CourtReservationWithCourt = CourtReservation & {
  courts: Pick<Court, 'id' | 'name' | 'region' | 'indoor' | 'hourly_price'>;
};

// ---- 신고·차단 (moderation) ----
export type ReportTargetType = 'meetup' | 'club' | 'profile' | 'tournament';
export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

export type UserBlock = {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

export type Report = {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  target_user_id: string | null;
  reason: string;
  detail: string;
  status: ReportStatus;
  created_at: string;
};

// ---- Supabase generic Database 타입 (createClient 제네릭용) ----
type WriteDefaults<T> = Partial<T>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: WriteDefaults<Profile> & { id: string; nickname: string };
        Update: WriteDefaults<Profile>;
        Relationships: [];
      };
      meetups: {
        Row: Meetup;
        Insert: WriteDefaults<Meetup> & {
          host_id: string;
          title: string;
          location_name: string;
          start_time: string;
        };
        Update: WriteDefaults<Meetup>;
        Relationships: [];
      };
      meetup_participants: {
        Row: Participant;
        Insert: { meetup_id: string; user_id: string; status?: MeetupParticipantStatus };
        Update: WriteDefaults<Participant>;
        Relationships: [];
      };
      clubs: {
        Row: Club;
        Insert: WriteDefaults<Club> & { owner_id: string; name: string };
        Update: WriteDefaults<Club>;
        Relationships: [];
      };
      club_members: {
        Row: ClubMember;
        Insert: { club_id: string; user_id: string; role?: ClubRole; status?: ClubMemberStatus };
        Update: WriteDefaults<ClubMember>;
        Relationships: [];
      };
      tournaments: {
        Row: Tournament;
        Insert: WriteDefaults<Tournament> & {
          organizer_id: string;
          title: string;
          start_at: string;
        };
        Update: WriteDefaults<Tournament>;
        Relationships: [];
      };
      tournament_entries: {
        Row: TournamentEntry;
        Insert: { tournament_id: string; user_id: string } & WriteDefaults<TournamentEntry>;
        Update: WriteDefaults<TournamentEntry>;
        Relationships: [];
      };
      tournament_matches: {
        Row: TournamentMatch;
        Insert: WriteDefaults<TournamentMatch> & { tournament_id: string; phase: MatchPhase };
        Update: WriteDefaults<TournamentMatch>;
        Relationships: [];
      };
      tournament_courts: {
        Row: TournamentCourt;
        Insert: WriteDefaults<TournamentCourt> & { tournament_id: string; name: string };
        Update: WriteDefaults<TournamentCourt>;
        Relationships: [];
      };
      tournament_teams: {
        Row: TournamentTeam;
        Insert: WriteDefaults<TournamentTeam> & { tournament_id: string; name: string; captain_id: string };
        Update: WriteDefaults<TournamentTeam>;
        Relationships: [];
      };
      tournament_team_members: {
        Row: TournamentTeamMember;
        Insert: { team_id: string; user_id: string };
        Update: WriteDefaults<TournamentTeamMember>;
        Relationships: [];
      };
      courts: {
        Row: Court;
        Insert: WriteDefaults<Court> & { name: string };
        Update: WriteDefaults<Court>;
        Relationships: [];
      };
      court_reservations: {
        Row: CourtReservation;
        Insert: { court_id: string; user_id: string; slot_date: string; hour: number } & WriteDefaults<CourtReservation>;
        Update: WriteDefaults<CourtReservation>;
        Relationships: [];
      };
      court_open_days: {
        Row: CourtOpenDay;
        Insert: { court_id: string; day: string };
        Update: WriteDefaults<CourtOpenDay>;
        Relationships: [];
      };
      court_payments: {
        Row: CourtPayment;
        Insert: { order_id: string; user_id: string; court_id: string; slot_date: string } & WriteDefaults<CourtPayment>;
        Update: WriteDefaults<CourtPayment>;
        Relationships: [];
      };
      court_blocks: {
        Row: CourtBlock;
        Insert: { court_id: string; weekday: number; start_hour: number; end_hour: number } & WriteDefaults<CourtBlock>;
        Update: WriteDefaults<CourtBlock>;
        Relationships: [];
      };
      user_blocks: {
        Row: UserBlock;
        Insert: { blocker_id: string; blocked_id: string };
        Update: WriteDefaults<UserBlock>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: { reporter_id: string; target_type: ReportTargetType; target_id: string; reason: string } & WriteDefaults<Report>;
        Update: WriteDefaults<Report>;
        Relationships: [];
      };
    };
    Views: {
      meetups_with_counts: {
        Row: MeetupWithCounts;
        Relationships: [];
      };
      clubs_with_counts: {
        Row: ClubWithCounts;
        Relationships: [];
      };
      tournaments_with_counts: {
        Row: TournamentWithCounts;
        Relationships: [];
      };
    };
    Functions: {
      delete_account: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
