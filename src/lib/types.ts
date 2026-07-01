// ============================================================
// 도메인 타입 + Supabase Database 타입 (수동 정의)
// ============================================================

export type PlayStyle = 'aggressive' | 'control' | 'all';

export const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  aggressive: '공격형',
  control: '컨트롤형',
  all: '올라운드',
};

export type MeetupStatus = 'open' | 'closed' | 'cancelled';

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
  // DUPR 연동 대비 (추후 파트너 API 로 검증)
  dupr_id: string | null;
  dupr_rating: number | null;
  dupr_verified: boolean;
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
  joined_at: string;
};

/** 참가자 + 프로필 (조인 결과) */
export type ParticipantWithProfile = Participant & {
  profiles: Pick<Profile, 'id' | 'nickname' | 'skill_level' | 'avatar_url' | 'region'>;
};

// ---- 클럽(동호회) ----
export type ClubRole = 'owner' | 'member';

export type Club = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  region: string;
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
  joined_at: string;
};

/** 멤버 + 프로필 (조인 결과) */
export type ClubMemberWithProfile = ClubMember & {
  profiles: Pick<Profile, 'id' | 'nickname' | 'skill_level' | 'avatar_url' | 'region'>;
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
        Insert: { meetup_id: string; user_id: string };
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
        Insert: { club_id: string; user_id: string; role?: ClubRole };
        Update: WriteDefaults<ClubMember>;
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
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
