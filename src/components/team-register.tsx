import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { AppColors } from '@/theme';
import { skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { PartnerProfile, TournamentTeamWithMembers, TournamentWithCounts } from '@/lib/types';

type MyClub = { id: string; name: string };
type Picked = PartnerProfile & { guest: boolean }; // guest = 용병(클럽 밖 회원)

// 단체전 팀 신청/관리 — 주장이 자기가 속한 클럽을 골라 팀 단위로 신청한다(0101).
//   팀원은 그 클럽의 승인 회원 중에서 고르고, 클럽 밖 회원은 '용병'으로 넣는다.
//   한 클럽에서 여러 팀이 나갈 수 있어 팀 이름은 클럽 이름이 기본이고 바꿀 수 있다(예: 송도클레이 A).
//   서버도 같은 규칙을 지킨다(주장·용병 아닌 팀원은 그 클럽 승인 회원).
export function TeamRegister({
  tournament,
  uid,
  onChange,
}: {
  tournament: TournamentWithCounts;
  uid: string | undefined;
  onChange?: () => void;
}) {
  const router = useRouter();
  const id = tournament.id;
  const canRegister = tournament.status === 'registration';
  const minSize = tournament.team_min_size || 2; // 뷰 반영 전 대비 기본값

  const [teams, setTeams] = useState<TournamentTeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // 팀 만들기 상태
  const [myClubs, setMyClubs] = useState<MyClub[] | null>(null); // null = 불러오는 중
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubRoster, setClubRoster] = useState<PartnerProfile[]>([]); // 고른 클럽의 승인 회원
  const [teamName, setTeamName] = useState('');
  const [picked, setPicked] = useState<Picked[]>([]);
  const [mode, setMode] = useState<'club' | 'guest'>('club');
  const [query, setQuery] = useState('');
  const [guestResults, setGuestResults] = useState<PartnerProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [teamQuery, setTeamQuery] = useState('');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tournament_teams')
      .select('*, club:clubs(id, name), members:tournament_team_members(user_id, is_guest, profiles(id, nickname, skill_level, avatar_url, region))')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true });
    setTeams((data as unknown as TournamentTeamWithMembers[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // 내가 승인 회원인 클럽 — 하나뿐이면 바로 고른다
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('club_members').select('club_id, clubs(id, name)').eq('user_id', uid).eq('status', 'approved');
      if (cancelled) return;
      const list = ((data as unknown as { clubs: MyClub | null }[] | null) ?? [])
        .map((r) => r.clubs)
        .filter((c): c is MyClub => !!c)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setMyClubs(list);
      if (list.length === 1) {
        setClubId(list[0].id);
        setTeamName((cur) => cur || list[0].name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 고른 클럽의 승인 회원 목록(클럽 회원 추가용)
  useEffect(() => {
    if (!clubId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClubRoster([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('club_members')
        .select('user_id, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('club_id', clubId)
        .eq('status', 'approved');
      if (cancelled) return;
      const list = ((data as unknown as { profiles: PartnerProfile | null }[] | null) ?? [])
        .map((r) => r.profiles)
        .filter((p): p is PartnerProfile => !!p)
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
      setClubRoster(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const myTeam = teams.find((t) => t.captain_id === uid || t.members.some((m) => m.user_id === uid));
  const isCaptain = myTeam?.captain_id === uid;
  const approvedTeams = teams.filter((t) => t.status === 'approved');
  const filteredTeams = approvedTeams.filter((item) => {
    const term = teamQuery.trim().toLowerCase();
    if (!term) return true;
    return item.name.toLowerCase().includes(term) ||
      item.club?.name.toLowerCase().includes(term) ||
      item.members.some((member) => member.profiles?.nickname.toLowerCase().includes(term));
  });

  // 이미 이 대회 팀에 속한 유저(주장·팀원)는 추가 후보에서 제외
  const takenIds = useMemo(() => new Set<string>(teams.flatMap((t) => [t.captain_id, ...t.members.map((m) => m.user_id)])), [teams]);
  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked]);
  const available = (p: PartnerProfile) => p.id !== uid && !takenIds.has(p.id) && !pickedIds.has(p.id);

  // 클럽 회원: 고른 클럽 명단에서 이름으로 찾는다. 회원이 많은 클럽도 있어 검색어를 넣어야 목록이 뜬다.
  const q = query.trim().toLowerCase();
  const clubResults = q ? clubRoster.filter((p) => available(p) && p.nickname.toLowerCase().includes(q)).slice(0, 10) : [];

  // 용병: 전체 회원에서 닉네임 검색(300ms 디바운스). 고른 클럽의 회원은 '클럽 회원'으로 넣도록 뺀다.
  useEffect(() => {
    const term = query.trim();
    if (mode !== 'guest' || term.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuestResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, skill_level, avatar_url, region')
        .ilike('nickname', `%${term}%`)
        .neq('id', uid ?? '')
        .limit(16);
      const clubIds = new Set(clubRoster.map((p) => p.id));
      setGuestResults(((data as PartnerProfile[]) ?? []).filter((p) => available(p) && !clubIds.has(p.id)).slice(0, 8));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
    // available·clubRoster 는 매 렌더 새로 만들어져 query/mode/uid 변화에만 반응하도록 의존성 최소화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, uid]);

  function chooseClub(c: MyClub) {
    if (c.id === clubId) return;
    // 팀 이름이 비었거나 클럽 이름 그대로였으면 새 클럽 이름으로(직접 고친 이름은 그대로 둔다)
    setTeamName((cur) => (!cur.trim() || (myClubs ?? []).some((x) => x.name === cur.trim()) ? c.name : cur));
    setClubId(c.id);
    // 클럽을 바꾸면 클럽 회원으로 고른 사람은 비운다(용병은 둔다)
    setPicked((prev) => prev.filter((p) => p.guest));
    setQuery('');
  }

  function add(p: PartnerProfile, guest: boolean) {
    setPicked((prev) => [...prev, { ...p, guest }]);
    setQuery('');
  }

  async function submitTeam() {
    if (!uid) return;
    if (!clubId) {
      Alert.alert('클럽 선택', '함께 나갈 클럽을 골라주세요.');
      return;
    }
    if (!teamName.trim()) {
      Alert.alert('팀 이름', '팀 이름을 입력해주세요.');
      return;
    }
    // 주장 포함 인원
    const totalSize = picked.length + 1;
    if (totalSize < minSize) {
      Alert.alert('최소 인원 부족', `이 대회는 팀당 최소 ${minSize}명이 필요해요. (현재 주장 포함 ${totalSize}명)`);
      return;
    }
    setActing(true);
    const { data: team, error } = await supabase
      .from('tournament_teams')
      .insert({ tournament_id: id, name: teamName.trim(), captain_id: uid, club_id: clubId })
      .select('id')
      .single();
    if (error || !team) {
      setActing(false);
      Alert.alert('팀 신청 실패', error?.message ?? '다시 시도해주세요.');
      return;
    }
    // 주장 + 선택한 팀원 등록
    const rows = [
      { team_id: team.id, user_id: uid, is_guest: false },
      ...picked.map((p) => ({ team_id: team.id, user_id: p.id, is_guest: p.guest })),
    ];
    const { error: memErr } = await supabase.from('tournament_team_members').insert(rows);
    if (memErr) {
      // 팀원 등록이 안 되면 빈 팀이 남지 않게 팀 신청도 되돌린다
      await supabase.from('tournament_teams').delete().eq('id', team.id);
      setActing(false);
      Alert.alert('팀원 등록 실패', memErr.message);
      return;
    }
    setActing(false);
    Alert.alert('팀 신청 완료', '주최자 승인 후 참가가 확정돼요.');
    setPicked([]);
    setQuery('');
    load();
  }

  function confirmCancel() {
    if (!myTeam) return;
    Alert.alert('팀 신청 취소', `'${myTeam.name}' 팀 신청을 취소할까요?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '신청 취소',
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          await supabase.from('tournament_teams').delete().eq('id', myTeam.id);
          setActing(false);
          load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ paddingVertical: Spacing.four }}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }

  const guestCount = picked.filter((p) => p.guest).length;
  const shownResults = mode === 'club' ? clubResults : guestResults;
  const formStep: 1 | 2 | 3 = !clubId || !teamName.trim() ? 1 : picked.length + 1 < minSize ? 2 : 3;

  return (
    <View style={{ gap: Spacing.three }}>
      {/* 내 팀이 있으면: 상태 + 팀원, 없으면: 팀 만들기 */}
      {myTeam ? (
        <View style={styles.section}>
          <View style={styles.myTeamHead}>
            <Text style={styles.sectionTitle}>내 팀 · {myTeam.name}</Text>
            <Badge
              label={myTeam.status === 'approved' ? '참가 확정' : myTeam.status === 'rejected' ? '거절됨' : '승인 대기'}
              color={myTeam.status === 'approved' ? '#16A34A' : myTeam.status === 'rejected' ? '#E5484D' : '#B45309'}
              bg={myTeam.status === 'approved' ? 'rgba(22,163,74,0.12)' : myTeam.status === 'rejected' ? 'rgba(229,72,77,0.12)' : 'rgba(245,158,11,0.14)'}
            />
          </View>
          <Text style={styles.mutedSmall}>
            {myTeam.club ? `${myTeam.club.name} · ` : ''}
            {isCaptain ? '내가 주장이에요.' : '팀원으로 참가해요.'} · {myTeam.members.length}명
          </Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {myTeam.members.map((m) => (
              <View key={m.user_id} style={styles.mRow}>
                <Avatar nickname={m.profiles?.nickname ?? '?'} uri={m.profiles?.avatar_url} size={38} />
                <View style={{ flex: 1 }}>
                  <View style={styles.mNameRow}>
                    <Text style={styles.mName}>{m.profiles?.nickname ?? '알 수 없음'}</Text>
                    {m.user_id === myTeam.captain_id && <Badge label="주장" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                    {m.is_guest ? <Badge label="용병" color="#F59E0B" bg="rgba(245,158,11,0.14)" /> : null}
                  </View>
                  <Text style={styles.mMeta}>{m.profiles?.region || '지역 미설정'}</Text>
                </View>
              </View>
            ))}
          </View>
          {isCaptain && canRegister && myTeam.status !== 'approved' ? (
            <Button title="팀 신청 취소" variant="outline" onPress={confirmCancel} loading={acting} style={{ marginTop: Spacing.two }} />
          ) : null}
        </View>
      ) : canRegister ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>단체전 참가 신청</Text>
          <Text style={styles.mutedSmall}>
            소속 클럽을 고르고 함께 뛸 팀원을 추가하세요. 클럽 밖 회원은 용병으로 넣을 수 있어요. 팀당 최소 {minSize}명.
          </Text>

          <View style={styles.stepProgress}>
            {(['팀 정보', '선수 구성', '신청 확인'] as const).map((label, index) => {
              const number = (index + 1) as 1 | 2 | 3;
              const active = formStep === number;
              const done = formStep > number;
              return (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepCircle, (active || done) && styles.stepCircleOn]}>
                    {done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : <Text style={[styles.stepNumber, active && styles.stepNumberOn]}>{number}</Text>}
                  </View>
                  <Text style={[styles.stepLabel, active && styles.stepLabelOn]}>{label}</Text>
                  {index < 2 ? <View style={[styles.stepLine, done && styles.stepLineOn]} /> : null}
                </View>
              );
            })}
          </View>

          {myClubs === null ? (
            <ActivityIndicator color="#16C784" style={{ marginTop: Spacing.three }} />
          ) : myClubs.length === 0 ? (
            <View style={[styles.notice, { marginTop: 10 }]}>
              <Ionicons name="people-outline" size={16} color={AppColors.textMuted} />
              <Text style={[styles.mMeta, { flex: 1 }]}>클럽에 가입한 회원만 단체전에 신청할 수 있어요. 클럽에 가입하고 승인을 받은 뒤 다시 와주세요.</Text>
              <Text onPress={() => router.push('/(tabs)/clubs')} style={styles.linkText}>
                클럽 찾기
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 10, gap: 10 }}>
              {/* 소속 클럽 */}
              <View style={styles.numberedTitle}><Text style={styles.number}>01</Text><Text style={styles.fieldLabelStrong}>소속 클럽</Text></View>
              <View style={styles.chips}>
                {myClubs.map((c) => (
                  <Pressable key={c.id} onPress={() => chooseClub(c)} style={[styles.chip, clubId === c.id && styles.chipOn]} accessibilityRole="button">
                    <Text style={[styles.chipText, clubId === c.id && styles.chipTextOn]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextField
                label="팀 이름"
                value={teamName}
                onChangeText={setTeamName}
                placeholder="예: 송도클레이 A"
                maxLength={20}
                hint="클럽 이름을 그대로 쓰거나, 한 클럽에서 여러 팀이 나가면 바꿔 주세요(예: 송도클레이 A)."
              />

              {/* 선택된 팀원 */}
              <View style={styles.numberedTitle}><Text style={styles.number}>02</Text><Text style={styles.fieldLabelStrong}>선수 구성</Text></View>
              {picked.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {picked.map((p) => (
                    <View key={p.id} style={styles.mRow}>
                      <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.mNameRow}>
                          <Text style={styles.mName}>{p.nickname}</Text>
                          {p.guest ? <Badge label="용병" color="#F59E0B" bg="rgba(245,158,11,0.14)" /> : null}
                        </View>
                        <Text style={styles.mMeta}>
                          {p.region || '지역 미설정'} · {p.skill_level.toFixed(1)} {skillLabel(p.skill_level)}
                        </Text>
                      </View>
                      <Text onPress={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))} style={styles.removeBtn}>
                        제거
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* 팀원 추가: 클럽 회원 / 용병 */}
              {clubId ? (
                <>
                  <View style={styles.segment}>
                    {(
                      [
                        { key: 'club', label: '클럽 회원' },
                        { key: 'guest', label: '용병 추가' },
                      ] as const
                    ).map((s) => (
                      <Pressable
                        key={s.key}
                        onPress={() => {
                          setMode(s.key);
                          setQuery('');
                        }}
                        style={[styles.segmentBtn, mode === s.key && styles.segmentOn]}
                        accessibilityRole="button">
                        <Text style={[styles.segmentText, mode === s.key && styles.segmentTextOn]}>{s.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextField
                    label={mode === 'club' ? '클럽 회원 찾기' : '용병 찾기'}
                    value={query}
                    onChangeText={setQuery}
                    placeholder={mode === 'club' ? '클럽 회원 닉네임 입력 후 목록에서 추가' : '닉네임 입력 후 목록에서 추가'}
                    autoCapitalize="none"
                  />
                  {query.trim().length === 0 ? (
                    <Text style={styles.mutedSmall}>
                      {mode === 'club' ? '닉네임을 입력하면 이 클럽의 회원을 찾아 줘요.' : '닉네임을 입력하면 클럽 밖 회원을 찾아 줘요.'}
                    </Text>
                  ) : mode === 'guest' && searching ? (
                    <Text style={styles.mutedSmall}>검색 중…</Text>
                  ) : shownResults.length === 0 ? (
                    <View style={styles.notice}>
                      <Ionicons name="alert-circle-outline" size={16} color={AppColors.textMuted} />
                      <Text style={[styles.mMeta, { flex: 1 }]}>
                        {mode === 'club'
                          ? '추가할 수 있는 클럽 회원이 없어요. (이미 다른 팀이면 제외)'
                          : '추가할 수 있는 회원이 없어요. (가입 회원만, 이 클럽 회원은 클럽 회원에서, 이미 다른 팀이면 제외)'}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {shownResults.map((p) => (
                        <Pressable key={p.id} onPress={() => add(p, mode === 'guest')} style={styles.pickRow}>
                          <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.mName}>{p.nickname}</Text>
                            <Text style={styles.mMeta}>
                              {p.region || '지역 미설정'} · {p.skill_level.toFixed(1)} {skillLabel(p.skill_level)}
                            </Text>
                          </View>
                          <Ionicons name="add-circle" size={22} color="#16C784" />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.mutedSmall}>소속 클럽을 고르면 팀원을 추가할 수 있어요.</Text>
              )}

              <Text style={styles.mutedSmall}>
                주장(나) 포함 {picked.length + 1}명 / 최소 {minSize}명{guestCount > 0 ? ` · 용병 ${guestCount}명` : ''}
              </Text>
              <View style={styles.applySummary}>
                <View style={{ flex: 1 }}><Text style={styles.summaryLabel}>신청 팀</Text><Text style={styles.summaryValue}>{teamName.trim() || '팀 이름 미정'}</Text></View>
                <Text style={styles.summaryCount}>{picked.length + 1}/{minSize}명</Text>
              </View>
              <Button title={picked.length + 1 < minSize ? `선수 ${minSize - picked.length - 1}명 더 필요` : '팀 참가 신청 완료'} onPress={submitTeam} loading={acting} disabled={!clubId || picked.length + 1 < minSize} />
            </View>
          )}
        </View>
      ) : (
        <View style={styles.closedNotice}>
          <Ionicons name="lock-closed-outline" size={16} color={AppColors.textMuted} />
          <Text style={styles.closedText}>접수가 마감되어 새로운 팀 신청을 받지 않아요.</Text>
        </View>
      )}

      {/* 참가 팀 목록 */}
      <View style={styles.section}>
        <View style={styles.teamListHead}>
          <View><Text style={styles.eyebrow}>TEAMS</Text><Text style={styles.sectionTitle}>참가 팀 {approvedTeams.length}팀</Text></View>
          <Text style={styles.expandHint}>팀을 눌러 선수 확인</Text>
        </View>
        {approvedTeams.length > 8 ? (
          <View style={styles.teamSearch}>
            <Ionicons name="search" size={17} color={AppColors.textMuted} />
            <TextInput
              value={teamQuery}
              onChangeText={setTeamQuery}
              placeholder="팀·클럽·선수 이름 검색"
              placeholderTextColor={AppColors.textMuted}
              style={styles.teamSearchInput}
            />
            {teamQuery ? <Pressable onPress={() => setTeamQuery('')} hitSlop={8}><Ionicons name="close-circle" size={18} color={AppColors.textMuted} /></Pressable> : null}
          </View>
        ) : null}
        <View style={styles.teamList}>
          {approvedTeams.length === 0 ? (
            <Text style={styles.mutedSmall}>아직 확정된 팀이 없어요.</Text>
          ) : filteredTeams.length === 0 ? (
            <View style={styles.noResult}><Ionicons name="search-outline" size={20} color={AppColors.textMuted} /><Text style={styles.mutedSmall}>검색 결과가 없어요.</Text></View>
          ) : (
            filteredTeams.map((team, index) => {
              const expanded = expandedTeamId === team.id;
              const guestCountInTeam = team.members.filter((member) => member.is_guest).length;
              return (
                <View key={team.id} style={[styles.teamRowWrap, index > 0 && styles.teamRowDivider]}>
                  <Pressable onPress={() => setExpandedTeamId(expanded ? null : team.id)} style={styles.teamRow}>
                    <View style={styles.teamIndex}><Text style={styles.teamIndexText}>{String(index + 1).padStart(2, '0')}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
                      <Text style={styles.teamMeta} numberOfLines={1}>
                        {team.club?.name ?? '소속 클럽 없음'} · 선수 {team.members.length}명{guestCountInTeam ? ` · 용병 ${guestCountInTeam}명` : ''}
                      </Text>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={AppColors.textMuted} />
                  </Pressable>
                  {expanded ? (
                    <View style={styles.roster}>
                      {team.members.map((member) => (
                        <View key={member.user_id} style={styles.rosterRow}>
                          <Avatar nickname={member.profiles?.nickname ?? '?'} uri={member.profiles?.avatar_url} size={30} />
                          <View style={{ flex: 1 }}><Text style={styles.rosterName}>{member.profiles?.nickname ?? '알 수 없음'}</Text><Text style={styles.rosterMeta}>{member.profiles?.region || '지역 미설정'} · {member.profiles?.skill_level.toFixed(1) ?? '-'}</Text></View>
                          {member.user_id === team.captain_id ? <Badge label="주장" color="#16C784" bg="rgba(22,199,132,0.14)" /> : member.is_guest ? <Badge label="용병" color="#F5B942" bg="rgba(245,185,66,0.14)" /> : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary },
  eyebrow: { color: AppColors.primary, fontSize: 10, fontWeight: '900', marginBottom: 3 },
  mutedSmall: { fontSize: 13, color: AppColors.textSecondary, marginTop: 4, lineHeight: 19 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: AppColors.textSecondary },
  myTeamHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mName: { fontSize: 15, fontWeight: '700', color: AppColors.textPrimary },
  mMeta: { fontSize: 13, color: AppColors.textSecondary, marginTop: 1 },
  removeBtn: { fontSize: 13, fontWeight: '700', color: '#E5484D', paddingHorizontal: 8, paddingVertical: 6 },
  linkText: { fontSize: 13, fontWeight: '800', color: AppColors.primary, paddingHorizontal: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, padding: 10 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, padding: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: AppColors.surface, maxWidth: '100%' },
  chipOn: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  chipText: { fontSize: 14, fontWeight: '700', color: AppColors.textSecondary },
  chipTextOn: { color: '#07110C' },
  segment: { flexDirection: 'row', padding: 3, borderRadius: 8, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border },
  segmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 6 },
  segmentOn: { backgroundColor: AppColors.surfaceSoft },
  segmentText: { fontSize: 14, fontWeight: '700', color: AppColors.textMuted },
  segmentTextOn: { color: AppColors.textPrimary },
  closedNotice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  closedText: { flex: 1, color: AppColors.textSecondary, fontSize: 12, lineHeight: 18 },
  teamListHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  expandHint: { color: AppColors.textMuted, fontSize: 10, fontWeight: '700' },
  teamSearch: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 12, borderRadius: 8, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border },
  teamSearchInput: { flex: 1, color: AppColors.textPrimary, fontSize: 14, paddingVertical: 10 },
  teamList: { marginTop: 8, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, overflow: 'hidden' },
  teamRowWrap: { backgroundColor: AppColors.surface },
  teamRowDivider: { borderTopWidth: 1, borderTopColor: AppColors.border },
  teamRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9 },
  teamIndex: { width: 31, height: 31, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceSoft },
  teamIndexText: { color: AppColors.primary, fontSize: 11, fontWeight: '900' },
  teamName: { fontSize: 14, fontWeight: '800', color: AppColors.textPrimary },
  teamMeta: { fontSize: 11, color: AppColors.textSecondary, marginTop: 3 },
  roster: { backgroundColor: '#0B1015', borderTopWidth: 1, borderTopColor: AppColors.border, paddingHorizontal: 12, paddingVertical: 4 },
  rosterRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  rosterName: { color: AppColors.textPrimary, fontSize: 13, fontWeight: '700' },
  rosterMeta: { color: AppColors.textMuted, fontSize: 10, marginTop: 2 },
  noResult: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 4 },
  stepProgress: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 16, paddingHorizontal: 8 },
  stepItem: { flex: 1, alignItems: 'center', position: 'relative' },
  stepCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceSoft, borderWidth: 1, borderColor: AppColors.border, zIndex: 1 },
  stepCircleOn: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  stepNumber: { color: AppColors.textMuted, fontSize: 12, fontWeight: '800' },
  stepNumberOn: { color: '#FFFFFF' },
  stepLabel: { color: AppColors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 6 },
  stepLabelOn: { color: AppColors.textPrimary },
  stepLine: { position: 'absolute', top: 13, left: '65%', width: '70%', height: 2, backgroundColor: AppColors.border },
  stepLineOn: { backgroundColor: AppColors.primary },
  numberedTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  number: { color: AppColors.primary, fontSize: 11, fontWeight: '900' },
  fieldLabelStrong: { color: AppColors.textPrimary, fontSize: 16, fontWeight: '800' },
  applySummary: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, padding: 12, backgroundColor: AppColors.surface },
  summaryLabel: { color: AppColors.textMuted, fontSize: 11, fontWeight: '700' },
  summaryValue: { color: AppColors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 3 },
  summaryCount: { color: AppColors.primary, fontSize: 14, fontWeight: '900' },
});
