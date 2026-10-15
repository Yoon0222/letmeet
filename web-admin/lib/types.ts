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
  court_assign_mode: 'auto' | 'manual'; // 코트 배정 방식 (0057)
  dupr_certified: boolean; // DUPR 인증 대회 (0059)
  dupr_premium: boolean; // DUPR+ 전용 — PREMIUM_L1+VERIFIED_L1 만 참가 (0084)
  team_min_size: number; // 단체전: 팀당 최소 인원 (0037)
  tie_singles: number; // 단체전: 타이당 단식 매치 수 (0037)
  tie_doubles: number; // 단체전: 타이당 복식 매치 수 (0037)
  images: string[]; // 대회 사진 — 첫 장이 메인 커버 (0043→0044)
  created_at: string;
};

// 번개 경기기록 (0059) — 경기 수정/삭제 요청 처리 화면에서 사용
export type MeetupMatchRow = {
  id: string;
  meetup_id: string;
  format: 'singles' | 'doubles';
  a1: string;
  a2: string | null;
  b1: string;
  b2: string | null;
  games: { a: number; b: number }[];
  dupr_status: 'pending' | 'submitted' | 'failed' | 'skipped';
  dupr_match_code: string | null;
  created_at: string;
};

// DUPR 경기 수정·삭제 요청 (0085) — 호스트가 요청, 운영자가 처리
export type MatchChangeRequest = {
  id: string;
  source: 'meetup';
  match_id: string;
  meetup_id: string;
  requester_id: string;
  kind: 'edit' | 'delete';
  message: string;
  status: 'pending' | 'done' | 'rejected';
  resolved_by: string | null;
  resolved_at: string | null;
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
  dupr_status: 'pending' | 'submitted' | 'failed' | 'skipped'; // DUPR 등록 상태 (0059)
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
  team1_lineup_ready: boolean; // 오더 제출 잠금 (0041)
  team2_lineup_ready: boolean;
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

/** 코트 환불 정책 단계 — "예약일 days_before일 전까지 취소하면 rate% 환불". 해당 없으면 0%. */
export type RefundTier = { days_before: number; rate: number };

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
  refund_policy: RefundTier[]; // 취소 환불 단계(내림차순 평가)
  created_at: string;
};

/** 코트 등록 요청 (0046) — 앱 유저가 검색에 없는 코트를 요청 */
export type CourtRegRequestStatus = 'pending' | 'approved' | 'rejected';
export type CourtRegistrationRequest = {
  id: string;
  requester_id: string;
  name: string;
  address: string;
  region: string;
  note: string;
  status: CourtRegRequestStatus;
  court_id: string | null;
  created_at: string;
};

/** meetup_participants — 번개 참가자(승인 대기 / 승인) */
export type MeetupParticipantRow = {
  meetup_id: string;
  user_id: string;
  status: 'pending' | 'approved';
  joined_at: string;
};

// ---- 번개 완료·출석 + 챌린지 (0099) — 쓰기는 모두 서버 함수 경유(앱이 표에 직접 쓸 수 없다) ----
export type AttendanceStatus = 'present' | 'absent' | 'unknown'; // 참석 / 불참 / 미확인

/**
 * meetup_completions — 번개 완료 기록(번개당 1행). 행이 없으면 아직 완료 처리 전. voided = 운영자가 무효 처리.
 * 번개가 지워져도(호스트 탈퇴 등) 이 행은 남는다 → meetup_id 가 null 이 되고, 제목·장소·시작 시각은 완료 시점의 값이다.
 */
export type MeetupCompletion = {
  id: string;
  meetup_id: string | null;
  host_id: string | null;
  meetup_title: string;
  location_name: string;
  meetup_start_time: string;
  present_count: number; // 참석으로 확정된 인원
  status: 'completed' | 'voided';
  completed_at: string; // 완료 처리 시각(챌린지 인정 날짜의 기준)
  completed_by: string | null;
  voided_at: string | null; // 무효 사유·처리자는 감사로그에 남는다
  updated_at: string;
};

/** meetup_attendance — 출석(완료 기록 × 회원). 본인·그 번개의 호스트·운영자만 조회된다 */
export type MeetupAttendance = {
  completion_id: string;
  user_id: string;
  meetup_id: string | null; // 번개가 지워지면 null
  status: AttendanceStatus;
  marked_by: string | null;
  marked_at: string;
  updated_at: string;
};

/** challenges — 챌린지(이벤트) 설정. 일반 사용자에게는 켜진(active) 것만 조회된다 */
export type Challenge = {
  id: string;
  kind: 'meetup_attendance'; // 실적을 세는 방식(지금은 번개 참석 하나)
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  goal_count: number;
  daily_limit: number; // 하루 최대 인정 횟수 — 완료 처리한 날·번개가 열린 날 둘 다에 적용(한국 날짜)
  active: boolean;
  completion_grace_days: number; // 종료 뒤 며칠까지의 완료 처리를 인정할지(번개는 종료 전에 열린 것만)
  visible_days_after_end: number; // 종료 뒤 며칠 동안 앱에 카드·메뉴를 보여줄지
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** challenge_enrollments — 참여 신청(인스타그램 아이디 등록). 본인 것만 조회된다(운영자는 전부). 쓰기는 challenge_join / challenge_leave 로만 */
export type ChallengeEnrollment = {
  challenge_id: string;
  user_id: string;
  instagram_id: string; // '@' 없이, 소문자
  enrolled_at: string; // 이 시각 이후에 완료 처리된 참석만 인정된다
  updated_at: string;
};

/** 인정되지 않은 이유: 완료 무효 / 번개 취소 / 불참 / 미확인 / 참석자 2명 미만 / 참여 신청 전 / 하루 한도 초과 */
export type ChallengeEntryReason = 'voided' | 'cancelled' | 'absent' | 'unknown' | 'too_few' | 'before_join' | 'daily_limit';

export type ChallengeJoinResult = 'ok' | 'updated' | 'forbidden' | 'not_found' | 'ended' | 'invalid_instagram' | 'instagram_taken';

/** challenge_entries() 한 줄 — 기간 안에 완료 처리된 번개의 출석 기록 + 인정 여부 */
export type ChallengeEntry = {
  user_id: string;
  completion_id: string;
  meetup_id: string | null; // 번개가 지워졌으면 null(기록은 남는다)
  meetup_title: string;
  location_name: string;
  meetup_start_time: string;
  completed_at: string;
  credit_date: string; // 인정 날짜 = 완료 처리 시각의 한국 날짜('YYYY-MM-DD')
  attendance: AttendanceStatus;
  counted: boolean; // 실제 참석으로 치는가
  credited: boolean; // 챌린지 실적으로 인정되는가
  reason: ChallengeEntryReason | null;
  credit_no: number | null; // 몇 번째 인정 건인가
};

/** challenge_progress() 한 줄. progress = min(credited_count, goal_count). 참여 신청 전이면 enrolled = false, 횟수 0 */
export type ChallengeProgress = {
  challenge_id: string;
  user_id: string;
  enrolled: boolean;
  enrolled_at: string | null;
  instagram_id: string | null;
  actual_count: number; // 실제 참석 횟수(참여 신청한 뒤의 것만)
  credited_count: number; // 하루 한도를 적용한 인정 횟수
  goal_count: number;
  progress: number;
  achieved: boolean;
  achieved_at: string | null;
};

/** challenge_participants() 한 줄(운영자 전용) */
export type ChallengeParticipantRow = {
  user_id: string;
  nickname: string;
  email: string | null;
  actual_count: number;
  credited_count: number;
  goal_count: number;
  progress: number;
  achieved: boolean;
  achieved_at: string | null;
  last_credited_at: string | null;
  enrolled_at: string;
  instagram_id: string;
};

export type MeetupCompleteResult =
  | 'ok'
  | 'not_found'
  | 'forbidden'
  | 'cancelled'
  | 'not_started'
  | 'already_completed'
  | 'voided'
  | 'invalid_member'
  | 'need_two';

/** 이벤트 팝업 (0047) — 앱 홈에 노출. active=올리기/내리기, starts_at~ends_at=노출 기간 */
export type EventPopup = {
  id: string;
  title: string;
  body: string;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null; // 배너 이미지(선택) (0048)
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  // 참가비 결제 (0089, 유료 대회)
  payment_id: string | null;
  paid_at: string | null;
  payment_deadline: string | null;
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

// 번개 공유 페이지(/m/[id])가 읽는 번개 요약 — meetups_with_counts 뷰의 일부 열(누구나 읽을 수 있는 공개 정보만)
export type MeetupShareRow = {
  id: string;
  title: string;
  location_name: string;
  region: string;
  start_time: string;
  duration_min: number;
  skill_min: number;
  skill_max: number;
  max_players: number;
  fee: number; // 게스트비(원), 0=무료
  discipline: 'any' | 'singles' | 'doubles';
  status: 'open' | 'closed' | 'cancelled';
  image_url: string | null; // 코트·장소 사진(미리보기 이미지로 쓴다)
  dupr_certified: boolean;
  dupr_premium: boolean;
  participant_count: number; // 승인된 참가자 수(호스트 포함)
};

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
      meetups: {
        Row: { id: string; title: string; host_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      meetup_matches: {
        Row: MeetupMatchRow;
        Insert: Write<MeetupMatchRow> & { meetup_id: string; format: string; a1: string; b1: string };
        Update: Write<MeetupMatchRow>;
        Relationships: [];
      };
      match_change_requests: {
        Row: MatchChangeRequest;
        Insert: Write<MatchChangeRequest> & { match_id: string; meetup_id: string; requester_id: string; kind: 'edit' | 'delete' };
        Update: Write<MatchChangeRequest>;
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
      court_registration_requests: {
        Row: CourtRegistrationRequest;
        Insert: Write<CourtRegistrationRequest> & { requester_id: string; name: string };
        Update: Write<CourtRegistrationRequest>;
        Relationships: [];
      };
      event_popups: {
        Row: EventPopup;
        Insert: Write<EventPopup> & { title: string };
        Update: Write<EventPopup>;
        Relationships: [];
      };
      meetup_participants: {
        Row: MeetupParticipantRow;
        Insert: Write<MeetupParticipantRow>;
        Update: Write<MeetupParticipantRow>;
        Relationships: [];
      };
      // 번개 완료·출석 + 챌린지 (0099) — 완료·출석은 서버 함수로만 기록된다(직접 쓰기는 서버가 거절)
      meetup_completions: {
        Row: MeetupCompletion;
        Insert: Write<MeetupCompletion>;
        Update: Write<MeetupCompletion>;
        Relationships: [];
      };
      meetup_attendance: {
        Row: MeetupAttendance;
        Insert: Write<MeetupAttendance>;
        Update: Write<MeetupAttendance>;
        Relationships: [];
      };
      challenges: {
        Row: Challenge;
        Insert: Write<Challenge> & { title: string; starts_at: string; ends_at: string; goal_count: number };
        Update: Write<Challenge>;
        Relationships: [];
      };
      challenge_enrollments: {
        Row: ChallengeEnrollment;
        Insert: Write<ChallengeEnrollment>;
        Update: Write<ChallengeEnrollment>;
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
      meetups_with_counts: {
        Row: MeetupShareRow;
        Relationships: [];
      };
    };
    Functions: {
      // 번개 완료·출석 + 챌린지 (0099)
      meetup_complete: { Args: { p_meetup_id: string; p_present: string[]; p_absent?: string[] }; Returns: MeetupCompleteResult };
      meetup_attendance_admin_set: {
        Args: { p_completion_id: string; p_user_id: string; p_status: AttendanceStatus; p_note?: string };
        Returns: 'ok' | 'forbidden' | 'invalid' | 'not_found' | 'invalid_member';
      };
      meetup_completion_admin_set: {
        Args: { p_completion_id: string; p_status: 'voided' | 'completed'; p_reason?: string };
        Returns: 'ok' | 'forbidden' | 'invalid' | 'not_found' | 'cancelled';
      };
      meetup_completion_admin_set_time: {
        Args: { p_completion_id: string; p_completed_at: string; p_note?: string };
        Returns: 'ok' | 'forbidden' | 'invalid' | 'not_found';
      };
      challenge_join: { Args: { p_challenge_id: string; p_instagram_id: string }; Returns: ChallengeJoinResult };
      challenge_leave: { Args: { p_challenge_id: string }; Returns: 'ok' | 'forbidden' | 'not_found' | 'ended' };
      challenge_enrollment_admin_set: {
        Args: { p_challenge_id: string; p_user_id: string; p_enrolled_at?: string | null; p_instagram_id?: string | null; p_note?: string };
        Returns: 'ok' | 'forbidden' | 'not_found' | 'invalid' | 'invalid_instagram' | 'instagram_taken';
      };
      challenge_entries: { Args: { p_challenge_id: string; p_user_id?: string }; Returns: ChallengeEntry[] };
      challenge_progress: { Args: { p_challenge_id: string; p_user_id?: string }; Returns: ChallengeProgress[] };
      challenge_participants: { Args: { p_challenge_id: string }; Returns: ChallengeParticipantRow[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
