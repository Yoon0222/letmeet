import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TeamLineup } from '@/components/team-lineup';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { AppColors } from '@/theme';
import { supabase } from '@/lib/supabase';
import type { TieMatch, TournamentTeamWithMembers, TournamentTie } from '@/lib/types';

// 단체전 대진 표시 (읽기전용) — 조별 팀 순위 + 타이·서브매치 결과·오더 + 본선.
// 오더는 양 팀 모두 제출해야(블라인드) 공개된다.
export function TeamBracketView({
  tournamentId,
  uid,
  refreshKey = 0,
  onChange,
}: {
  tournamentId: string;
  uid?: string;
  refreshKey?: number;
  onChange?: () => void;
}) {
  const [teams, setTeams] = useState<TournamentTeamWithMembers[]>([]);
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [expandedTieId, setExpandedTieId] = useState<string | null>(null);
  const [selectedKoTieId, setSelectedKoTieId] = useState<string | null>(null);
  const [phase, setPhase] = useState<'group' | 'knockout'>('group');
  const [knockoutView, setKnockoutView] = useState<'tree' | 'list'>('tree');
  const [selectedKoRound, setSelectedKoRound] = useState<number | null>(null);
  const [playerQuery, setPlayerQuery] = useState('');
  const [matchDetailTieId, setMatchDetailTieId] = useState<string | null>(null);
  const [lineupTieId, setLineupTieId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: tm }, { data: ti }, { data: cs }] = await Promise.all([
      supabase
        .from('tournament_teams')
        .select('*, members:tournament_team_members(user_id, profiles(id, nickname, skill_level, avatar_url, region))')
        .eq('tournament_id', tournamentId),
      supabase.from('tournament_ties').select('*').eq('tournament_id', tournamentId).order('slot', { ascending: true }),
      supabase.from('tournament_courts').select('id, name').eq('tournament_id', tournamentId),
    ]);
    setCourts((cs as { id: string; name: string }[]) ?? []);
    setTeams((tm as unknown as TournamentTeamWithMembers[]) ?? []);
    const tieList = (ti as TournamentTie[]) ?? [];
    setTies(tieList);
    const firstGroup = tieList.find((tie) => tie.phase === 'group')?.group_no ?? null;
    setSelectedGroup((current) => current ?? firstGroup);
    if (!tieList.some((tie) => tie.phase === 'group') && tieList.some((tie) => tie.phase === 'knockout')) {
      setPhase('knockout');
    }
    if (tieList.length > 0) {
      const { data: sm } = await supabase.from('tie_matches').select('*').in('tie_id', tieList.map((x) => x.id)).order('slot', { ascending: true });
      setSubs((sm as TieMatch[]) ?? []);
    }
    setLoaded(true);
  }, [tournamentId]);

  useEffect(() => {
    // refreshKey 변경 시(오더 저장 등) 다시 로드
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, refreshKey]);

  if (!loaded) return null;
  // 진행(대진 생성) 전 안내
  if (ties.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>아직 대진이 시작되지 않았어요. 접수 마감 후 운영자가 대진을 편성해요.</Text>
      </View>
    );
  }

  const nameOf = (teamId: string | null) => teams.find((x) => x.id === teamId)?.name ?? '미정';
  // uid -> 닉네임 (오더 표시용)
  const playerName = new Map<string, string>();
  teams.forEach((t) => t.members?.forEach((m) => playerName.set(m.user_id, m.profiles?.nickname ?? '?')));
  const lineup = (ids: string[]) => ids.map((id) => playerName.get(id) ?? '?').join('·');
  const groupTies = ties.filter((x) => x.phase === 'group');
  const groupNos = [...new Set(groupTies.map((x) => x.group_no ?? 1))].sort((a, b) => a - b);
  const koTies = ties.filter((x) => x.phase === 'knockout').sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot);
  const koRounds = [...new Set(koTies.map((x) => x.round_order ?? 1))].sort((a, b) => a - b);
  const normalizedPlayerQuery = playerQuery.trim().toLowerCase();
  const matchedTeamIds = new Set(
    normalizedPlayerQuery
      ? teams
          .filter((team) =>
            team.name.toLowerCase().includes(normalizedPlayerQuery) ||
            team.members.some((member) => (member.profiles?.nickname ?? '').toLowerCase().includes(normalizedPlayerQuery)),
          )
          .map((team) => team.id)
      : teams.map((team) => team.id),
  );
  const visibleKoTies = normalizedPlayerQuery
    ? koTies.filter((tie) => (tie.team1_id && matchedTeamIds.has(tie.team1_id)) || (tie.team2_id && matchedTeamIds.has(tie.team2_id)))
    : koTies;
  const visibleKoRounds = [...new Set(visibleKoTies.map((tie) => tie.round_order ?? 1))].sort((a, b) => a - b);
  const activeKoRound = selectedKoRound && visibleKoRounds.includes(selectedKoRound) ? selectedKoRound : visibleKoRounds[0] ?? null;
  const myTeam = teams.find((team) => team.captain_id === uid || team.members.some((member) => member.user_id === uid));
  const captainTeam = teams.find((team) => team.captain_id === uid && team.status === 'approved');
  const myUpcomingTies = myTeam
    ? ties
        .filter((tie) => tie.status !== 'done' && (tie.team1_id === myTeam.id || tie.team2_id === myTeam.id))
        .sort((first, second) => Number(!!second.court_id) - Number(!!first.court_id) || (first.round_order ?? 0) - (second.round_order ?? 0) || first.slot - second.slot)
    : [];

  function TieRow({ tie, showAllMatches = false }: { tie: TournamentTie; showAllMatches?: boolean }) {
    const tsubs = subs.filter((x) => x.tie_id === tie.id);
    const w1 = tsubs.filter((x) => x.winner === 'team1').length;
    const w2 = tsubs.filter((x) => x.winner === 'team2').length;
    const teamsConfirmed = !!tie.team1_id && !!tie.team2_id;
    const done = teamsConfirmed && tie.status === 'done';
    const expanded = showAllMatches || expandedTieId === tie.id;
    const canSubmitLineup = !!captainTeam && !!tie.court_id && !done && (tie.team1_id === captainTeam.id || tie.team2_id === captainTeam.id);
    // 오더는 양 팀 모두 제출해야 공개 (또는 경기 종료 시)
    const revealed = (tie.team1_lineup_ready && tie.team2_lineup_ready) || done;
    return (
      <View style={styles.tie}>
        <Pressable disabled={showAllMatches} onPress={() => setExpandedTieId(expanded ? null : tie.id)} style={styles.tiePress}>
          <View style={styles.tieStatusRow}>
            <Text style={styles.tieStatus}>
              {!teamsConfirmed ? '진행 전 · 상대 대기' : done ? '종료' : tie.court_id ? courts.find((c) => c.id === tie.court_id)?.name ?? '코트 배정' : '예정'}
            </Text>
            {showAllMatches ? (
              <Text style={styles.tieHint}>{tsubs.length}경기</Text>
            ) : (
              <Text style={styles.tieHint}>{expanded ? '접기' : '세부 경기'} <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={12} color={AppColors.textMuted} /></Text>
            )}
          </View>
          <View style={styles.tieHead}>
            <Text style={[styles.tieName, done && !!tie.winner_team_id && tie.winner_team_id === tie.team1_id && styles.win]} numberOfLines={1}>{nameOf(tie.team1_id)}</Text>
            <View style={styles.scoreBox}><Text style={styles.tieScore}>{done ? `${w1} : ${w2}` : 'VS'}</Text></View>
            <Text style={[styles.tieName, styles.right, done && !!tie.winner_team_id && tie.winner_team_id === tie.team2_id && styles.win]} numberOfLines={1}>{nameOf(tie.team2_id)}</Text>
          </View>
        </Pressable>
        {canSubmitLineup ? (
          <Pressable
            onPress={() => setLineupTieId(tie.id)}
            style={styles.lineupButton}
            accessibilityRole="button"
            accessibilityLabel={`${nameOf(tie.team1_id)} 대 ${nameOf(tie.team2_id)} 경기 오더 제출`}>
            <Ionicons name="clipboard-outline" size={15} color="#FFFFFF" />
            <Text style={styles.lineupButtonText}>오더 제출</Text>
          </Pressable>
        ) : null}
        {expanded && tie.team1_id && tie.team2_id ? (
          <View style={{ gap: 4, marginTop: 6 }}>
            {tsubs.map((m) => {
              const hasLineup = m.team1_players.length > 0 || m.team2_players.length > 0;
              return (
                <View key={m.id} style={styles.sub}>
                  <View style={styles.subTop}>
                    <Text style={styles.subKind}>{m.slot + 1}{m.kind === 'singles' ? '단' : '복'}</Text>
                    <Text style={styles.subResult}>
                      {m.status === 'done' && m.score1 != null ? `${m.score1} : ${m.score2}` : '예정'}
                    </Text>
                  </View>
                  {revealed && hasLineup ? (
                    <Text style={styles.lineup}>
                      {m.team1_players.length ? lineup(m.team1_players) : '미정'} vs {m.team2_players.length ? lineup(m.team2_players) : '미정'}
                    </Text>
                  ) : !revealed && (tie.team1_lineup_ready || tie.team2_lineup_ready) ? (
                    <Text style={styles.lineupHidden}>오더 미공개 (양 팀 제출 후 공개)</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : expanded ? (
          <Text style={styles.pending}>양 팀 확정 대기 중</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
      {myTeam ? (
        <View style={styles.myMatchesSection}>
          <View style={styles.myMatchesHead}>
            <View>
              <Text style={styles.eyebrow}>MY MATCH</Text>
              <Text style={styles.myMatchesTitle}>내 경기</Text>
            </View>
            <Badge label={myTeam.name} color={AppColors.primary} bg="rgba(22,199,132,0.13)" />
          </View>
          {myUpcomingTies.length > 0 ? (
            <View style={styles.myMatchList}>
              {myUpcomingTies.map((tie) => {
                const opponentId = tie.team1_id === myTeam.id ? tie.team2_id : tie.team1_id;
                const courtName = tie.court_id ? courts.find((court) => court.id === tie.court_id)?.name : null;
                return (
                  <Pressable key={tie.id} onPress={() => setMatchDetailTieId(tie.id)} style={styles.myMatchRow}>
                    <View style={styles.myMatchIcon}>
                      <Ionicons name={tie.phase === 'knockout' ? 'trophy-outline' : 'grid-outline'} size={18} color={AppColors.primary} />
                    </View>
                    <View style={styles.myMatchCopy}>
                      <Text style={styles.myMatchPhase}>{tie.phase === 'knockout' ? tie.round_name ?? '본선' : `${tie.group_no ?? 1}조 예선`}</Text>
                      <Text style={styles.myMatchOpponent} numberOfLines={1}>vs {nameOf(opponentId)}</Text>
                    </View>
                    <View style={styles.myMatchRight}>
                      <Text style={[styles.myMatchCourt, !courtName && styles.myMatchCourtPending]}>{courtName ?? '코트 대기'}</Text>
                      <Ionicons name="chevron-forward" size={16} color={AppColors.textMuted} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.myMatchesEmpty}>예정된 경기가 없어요.</Text>
          )}
        </View>
      ) : null}

      <View style={styles.phaseTabs}>
        <Pressable
          disabled={groupNos.length === 0}
          onPress={() => setPhase('group')}
          style={[styles.phaseTab, phase === 'group' && styles.phaseTabOn, groupNos.length === 0 && styles.phaseTabDisabled]}>
          <Ionicons name="grid-outline" size={17} color={phase === 'group' ? AppColors.primary : AppColors.textMuted} />
          <View>
            <Text style={[styles.phaseTabText, phase === 'group' && styles.phaseTabTextOn]}>예선</Text>
            <Text style={styles.phaseTabMeta}>{groupNos.length > 0 ? `${groupNos.length}개 조` : '대진 없음'}</Text>
          </View>
        </Pressable>
        <Pressable
          disabled={koTies.length === 0}
          onPress={() => setPhase('knockout')}
          style={[styles.phaseTab, phase === 'knockout' && styles.phaseTabOn, koTies.length === 0 && styles.phaseTabDisabled]}>
          <Ionicons name="git-network-outline" size={18} color={phase === 'knockout' ? AppColors.primary : AppColors.textMuted} />
          <View>
            <Text style={[styles.phaseTabText, phase === 'knockout' && styles.phaseTabTextOn]}>본선</Text>
            <Text style={styles.phaseTabMeta}>{koTies.length > 0 ? `${koRounds.length}개 라운드` : '대진 미정'}</Text>
          </View>
        </Pressable>
      </View>

      {phase === 'group' && groupNos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupTabs}>
          {groupNos.map((groupNo) => (
            <Pressable key={groupNo} onPress={() => setSelectedGroup(groupNo)} style={[styles.groupTab, selectedGroup === groupNo && styles.groupTabOn]}>
              <Text style={[styles.groupTabText, selectedGroup === groupNo && styles.groupTabTextOn]}>{groupNo}조</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {phase === 'group' && groupNos.filter((groupNo) => selectedGroup === null || groupNo === selectedGroup).map((g) => {
        const gt = groupTies.filter((x) => (x.group_no ?? 1) === g);
        const teamIds = [...new Set(gt.flatMap((x) => [x.team1_id, x.team2_id]).filter(Boolean) as string[])];
        // 팀 승수 + 득실 (서브매치 스코어 합산). 정렬: 승 → 득실 → 득점
        const stat = new Map<string, { wins: number; pf: number; pa: number }>();
        teamIds.forEach((tid) => stat.set(tid, { wins: 0, pf: 0, pa: 0 }));
        gt.forEach((tie) => {
          if (tie.status !== 'done') return;
          if (tie.winner_team_id && stat.has(tie.winner_team_id)) stat.get(tie.winner_team_id)!.wins++;
          subs.filter((m) => m.tie_id === tie.id && m.status === 'done' && m.score1 != null && m.score2 != null).forEach((m) => {
            const a = tie.team1_id ? stat.get(tie.team1_id) : undefined;
            const b = tie.team2_id ? stat.get(tie.team2_id) : undefined;
            if (a) { a.pf += m.score1!; a.pa += m.score2!; }
            if (b) { b.pf += m.score2!; b.pa += m.score1!; }
          });
        });
        const diffOf = (tid: string) => (stat.get(tid)?.pf ?? 0) - (stat.get(tid)?.pa ?? 0);
        const ranked = [...teamIds].sort((a, b) => (stat.get(b)!.wins - stat.get(a)!.wins) || (diffOf(b) - diffOf(a)) || (stat.get(b)!.pf - stat.get(a)!.pf));
        return (
          <View key={g} style={styles.section}>
            <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>GROUP {g}</Text><Text style={styles.sectionTitle}>{g}조 순위</Text></View><Text style={styles.sectionMeta}>{gt.filter((tie) => tie.status === 'done').length}/{gt.length}경기 완료</Text></View>
            <View style={styles.card}>
              {ranked.map((tid, i) => (
                <View key={tid} style={[styles.standRow, i > 0 && styles.divider]}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={styles.standName} numberOfLines={1}>{nameOf(tid)}</Text>
                  <Text style={styles.standDiff}>{diffOf(tid) > 0 ? '+' : ''}{diffOf(tid)}</Text>
                  <Text style={styles.standWins}>{stat.get(tid)?.wins ?? 0}승</Text>
                </View>
              ))}
            </View>
            <Text style={styles.matchSectionTitle}>조별 경기</Text>
            <View style={{ gap: 8 }}>{gt.map((tie) => <TieRow key={tie.id} tie={tie} showAllMatches />)}</View>
          </View>
        );
      })}

      {phase === 'knockout' && koTies.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>KNOCKOUT</Text><Text style={styles.sectionTitle}>본선 토너먼트</Text></View><Ionicons name="trophy-outline" size={22} color="#F5B942" /></View>
          <View style={styles.playerSearch}>
            <Ionicons name="search" size={17} color={AppColors.textMuted} />
            <TextInput
              value={playerQuery}
              onChangeText={setPlayerQuery}
              placeholder="선수 이름으로 대진 검색"
              placeholderTextColor={AppColors.textMuted}
              autoCapitalize="none"
              style={styles.playerSearchInput}
            />
            {playerQuery ? (
              <Pressable onPress={() => setPlayerQuery('')} hitSlop={8} accessibilityLabel="검색어 지우기">
                <Ionicons name="close-circle" size={19} color={AppColors.textMuted} />
              </Pressable>
            ) : null}
          </View>
          {normalizedPlayerQuery ? (
            <Text style={styles.searchResultText}>
              {matchedTeamIds.size > 0 ? `일치 팀 ${matchedTeamIds.size}개 · 경기 ${visibleKoTies.length}개` : '일치하는 선수가 없어요.'}
            </Text>
          ) : null}
          <View style={styles.viewSwitch}>
            {([
              { key: 'tree' as const, label: '대진표', icon: 'git-network-outline' as const },
              { key: 'list' as const, label: '경기 목록', icon: 'list-outline' as const },
            ]).map((item) => (
              <Pressable key={item.key} onPress={() => setKnockoutView(item.key)} style={[styles.viewSwitchButton, knockoutView === item.key && styles.viewSwitchButtonOn]}>
                <Ionicons name={item.icon} size={16} color={knockoutView === item.key ? AppColors.primary : AppColors.textMuted} />
                <Text style={[styles.viewSwitchText, knockoutView === item.key && styles.viewSwitchTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {visibleKoTies.length === 0 ? (
            <View style={styles.searchEmpty}>
              <Ionicons name="search-outline" size={22} color={AppColors.textMuted} />
              <Text style={styles.searchEmptyText}>검색된 선수의 본선 경기가 없어요.</Text>
            </View>
          ) : knockoutView === 'tree' ? (
            <>
              <Text style={styles.treeHint}>좌우로 움직여 전체 대진을 확인하고, 경기를 누르면 상세 정보가 열려요.</Text>
              <TeamKnockoutTree
                ties={visibleKoTies}
                subs={subs}
                nameOf={nameOf}
                selectedId={selectedKoTieId}
                onSelect={(tieId) => {
                  setSelectedKoTieId(tieId);
                  setMatchDetailTieId(tieId);
                }}
              />
            </>
          ) : (
            <View style={styles.knockoutList}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roundTabs}>
                {visibleKoRounds.map((round) => {
                  const roundTies = visibleKoTies.filter((tie) => (tie.round_order ?? 1) === round);
                  const active = activeKoRound === round;
                  return (
                    <Pressable key={round} onPress={() => setSelectedKoRound(round)} style={[styles.roundTab, active && styles.roundTabOn]}>
                      <Text style={[styles.roundTabText, active && styles.roundTabTextOn]}>{roundTies[0]?.round_name ?? `${round}라운드`}</Text>
                      <Text style={[styles.roundTabCount, active && styles.roundTabCountOn]}>{roundTies.length}경기</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {activeKoRound ? (() => {
                const roundTies = visibleKoTies.filter((tie) => (tie.round_order ?? 1) === activeKoRound);
                return (
                  <View style={styles.roundListSection}>
                    <View style={styles.roundListHead}>
                      <Text style={styles.roundListTitle}>{roundTies[0]?.round_name ?? `${activeKoRound}라운드`}</Text>
                      <Text style={styles.roundListMeta}>{roundTies.filter((tie) => tie.status === 'done').length}/{roundTies.length} 완료</Text>
                    </View>
                    <View style={styles.roundListMatches}>{roundTies.map((tie) => <TieRow key={tie.id} tie={tie} />)}</View>
                  </View>
                );
              })() : null}
            </View>
          )}
          {(() => {
            const finalRound = koRounds.at(-1);
            const finalTie = koTies.find((tie) => (tie.round_order ?? 1) === finalRound);
            if (!finalTie?.winner_team_id) return null;
            return (
              <View style={styles.championBox}>
                <View style={styles.championIcon}><Ionicons name="trophy" size={22} color="#F5B942" /></View>
                <View style={{ flex: 1 }}><Text style={styles.championLabel}>CHAMPION</Text><Text style={styles.championName}>{nameOf(finalTie.winner_team_id)}</Text></View>
              </View>
            );
          })()}
        </View>
      ) : null}

      <Modal
        visible={!!matchDetailTieId || !!lineupTieId}
        transparent
        animationType={lineupTieId ? 'slide' : 'fade'}
        onRequestClose={() => {
          setLineupTieId(null);
          setMatchDetailTieId(null);
        }}>
        <View style={lineupTieId ? styles.modalBackdrop : styles.detailModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              setLineupTieId(null);
              setMatchDetailTieId(null);
            }}
          />
          <View style={lineupTieId ? styles.modalSheet : styles.detailModalCard}>
            {lineupTieId ? <View style={styles.modalHandle} /> : null}
            <View style={styles.modalHead}>
              <View>
                <Text style={styles.modalEyebrow}>{lineupTieId ? 'COURT ORDER' : 'MATCH DETAIL'}</Text>
                <Text style={styles.modalTitle}>{lineupTieId ? '경기 오더 제출' : '경기 상세'}</Text>
              </View>
              <Pressable
                onPress={() => {
                  setLineupTieId(null);
                  setMatchDetailTieId(null);
                }}
                style={styles.modalClose}
                accessibilityLabel="모달 닫기">
                <Ionicons name="close" size={22} color={AppColors.textPrimary} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={lineupTieId ? styles.modalContent : styles.detailModalContent}>
              {lineupTieId && captainTeam ? (
                <TeamLineup
                  team={captainTeam}
                  tieId={lineupTieId}
                  onChange={() => {
                    load();
                    onChange?.();
                  }}
                  onSubmitted={() => {
                    setLineupTieId(null);
                    setMatchDetailTieId(null);
                  }}
                />
              ) : (
                ties.filter((tie) => tie.id === matchDetailTieId).map((tie) => <TieRow key={tie.id} tie={tie} showAllMatches />)
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const TREE_BOX_W = 158;
const TREE_BOX_H = 68;
const TREE_ROW_GAP = 22;
const TREE_COL_GAP = 34;
const TREE_LINE = 1.5;

function TreeHLine({ x, y, width }: { x: number; y: number; width: number }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: x, top: y - TREE_LINE / 2, width, height: TREE_LINE, backgroundColor: AppColors.border }} />;
}

function TreeVLine({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  return <View pointerEvents="none" style={{ position: 'absolute', left: x - TREE_LINE / 2, top, width: TREE_LINE, height: Math.max(0, bottom - top), backgroundColor: AppColors.border }} />;
}

function TeamKnockoutTree({
  ties,
  subs,
  nameOf,
  selectedId,
  onSelect,
}: {
  ties: TournamentTie[];
  subs: TieMatch[];
  nameOf: (teamId: string | null) => string;
  selectedId: string | null;
  onSelect: (tieId: string) => void;
}) {
  const roundOrders = [...new Set(ties.map((tie) => tie.round_order ?? 1))].sort((a, b) => a - b);
  const rounds = roundOrders.map((round) => ties.filter((tie) => (tie.round_order ?? 1) === round).sort((a, b) => a.slot - b.slot));
  const unit = TREE_BOX_H + TREE_ROW_GAP;
  const centers: number[][] = [];
  rounds.forEach((roundTies, roundIndex) => {
    if (roundIndex === 0) {
      centers.push(roundTies.map((_, index) => index * unit + unit / 2 + 24));
      return;
    }
    const previous = centers[roundIndex - 1];
    centers.push(roundTies.map((_, index) => {
      const first = previous[index * 2] ?? previous[previous.length - 1] ?? unit / 2;
      const second = previous[index * 2 + 1] ?? first;
      return (first + second) / 2;
    }));
  });
  const columnX = (index: number) => index * (TREE_BOX_W + TREE_COL_GAP);
  const height = Math.max(unit + 28, (rounds[0]?.length ?? 1) * unit + 28);
  const width = Math.max(TREE_BOX_W, rounds.length * (TREE_BOX_W + TREE_COL_GAP) - TREE_COL_GAP + 8);

  const scoreOf = (tie: TournamentTie) => {
    const tieSubs = subs.filter((item) => item.tie_id === tie.id);
    return {
      first: tieSubs.filter((item) => item.winner === 'team1').length,
      second: tieSubs.filter((item) => item.winner === 'team2').length,
    };
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.treeScroll}>
      <View style={{ width, height, position: 'relative' }}>
        {rounds.map((roundTies, roundIndex) => (
          <Text key={`round-${roundOrders[roundIndex]}`} style={[styles.treeRoundLabel, { left: columnX(roundIndex), width: TREE_BOX_W }]}>
            {roundTies[0]?.round_name ?? `${roundOrders[roundIndex]}라운드`}
          </Text>
        ))}
        {rounds.map((roundTies, roundIndex) => roundIndex === 0 ? null : roundTies.map((_, matchIndex) => {
          const previous = centers[roundIndex - 1];
          const firstY = previous[matchIndex * 2] ?? centers[roundIndex][matchIndex];
          const secondY = previous[matchIndex * 2 + 1] ?? firstY;
          const matchY = centers[roundIndex][matchIndex];
          const previousRight = columnX(roundIndex - 1) + TREE_BOX_W;
          const currentLeft = columnX(roundIndex);
          const middle = (previousRight + currentLeft) / 2;
          return (
            <View key={`line-${roundIndex}-${matchIndex}`} pointerEvents="none">
              <TreeHLine x={previousRight} y={firstY} width={middle - previousRight} />
              {firstY !== secondY ? <TreeHLine x={previousRight} y={secondY} width={middle - previousRight} /> : null}
              <TreeVLine x={middle} top={Math.min(firstY, secondY)} bottom={Math.max(firstY, secondY)} />
              <TreeHLine x={middle} y={matchY} width={currentLeft - middle} />
            </View>
          );
        }))}
        {rounds.map((roundTies, roundIndex) => roundTies.map((tie, matchIndex) => {
          const score = scoreOf(tie);
          const selected = selectedId === tie.id;
          const firstTeamName = tie.team1_id ? nameOf(tie.team1_id) : roundIndex === 0 ? 'BYE' : '미정';
          const secondTeamName = tie.team2_id ? nameOf(tie.team2_id) : roundIndex === 0 ? 'BYE' : '미정';
          return (
            <Pressable
              key={tie.id}
              onPress={() => onSelect(tie.id)}
              style={[
                styles.treeMatch,
                { left: columnX(roundIndex), top: centers[roundIndex][matchIndex] - TREE_BOX_H / 2, width: TREE_BOX_W, height: TREE_BOX_H },
                selected && styles.treeMatchSelected,
              ]}>
              <View style={styles.treeSide}>
                <Text style={[styles.treeTeam, !tie.team1_id && roundIndex === 0 && styles.treeBye, tie.status === 'done' && !!tie.winner_team_id && tie.winner_team_id === tie.team1_id && styles.treeWinner]} numberOfLines={1}>{firstTeamName}</Text>
                <Text style={[styles.treeScore, tie.status === 'done' && !!tie.winner_team_id && tie.winner_team_id === tie.team1_id && styles.treeWinner]}>{tie.status === 'done' ? score.first : '·'}</Text>
              </View>
              <View style={[styles.treeSide, styles.treeSideDivider]}>
                <Text style={[styles.treeTeam, !tie.team2_id && roundIndex === 0 && styles.treeBye, tie.status === 'done' && !!tie.winner_team_id && tie.winner_team_id === tie.team2_id && styles.treeWinner]} numberOfLines={1}>{secondTeamName}</Text>
                <Text style={[styles.treeScore, tie.status === 'done' && !!tie.winner_team_id && tie.winner_team_id === tie.team2_id && styles.treeWinner]}>{tie.status === 'done' ? score.second : '·'}</Text>
              </View>
            </Pressable>
          );
        }))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  myMatchesSection: { gap: 9, padding: 12, borderRadius: 8, borderCurve: 'continuous', backgroundColor: 'rgba(22,199,132,0.07)', borderWidth: 1, borderColor: 'rgba(22,199,132,0.28)' },
  myMatchesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  myMatchesTitle: { color: AppColors.textPrimary, fontSize: 18, fontWeight: '900' },
  myMatchList: { gap: 7 },
  myMatchRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 7, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border },
  myMatchIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: 'rgba(22,199,132,0.11)' },
  myMatchCopy: { flex: 1, minWidth: 0 },
  myMatchPhase: { color: AppColors.textMuted, fontSize: 10.5, fontWeight: '800' },
  myMatchOpponent: { color: AppColors.textPrimary, fontSize: 14, fontWeight: '900', marginTop: 2 },
  myMatchRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  myMatchCourt: { color: AppColors.primary, fontSize: 11, fontWeight: '900' },
  myMatchCourtPending: { color: AppColors.textMuted },
  myMatchesEmpty: { color: AppColors.textMuted, fontSize: 13, paddingVertical: 6 },
  phaseTabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  phaseTab: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderCurve: 'continuous',
  },
  phaseTabOn: { backgroundColor: 'rgba(22,199,132,0.13)' },
  phaseTabDisabled: { opacity: 0.42 },
  phaseTabText: { color: AppColors.textSecondary, fontSize: 14, fontWeight: '900' },
  phaseTabTextOn: { color: AppColors.textPrimary },
  phaseTabMeta: { color: AppColors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  section: { marginTop: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  eyebrow: { color: AppColors.primary, fontSize: 10, fontWeight: '900', marginBottom: 3 },
  sectionMeta: { color: AppColors.textMuted, fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary, marginBottom: 6 },
  groupTabs: { gap: 7, paddingVertical: 2 },
  groupTab: { minWidth: 56, height: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border },
  groupTabOn: { backgroundColor: 'rgba(22,199,132,0.13)', borderColor: 'rgba(22,199,132,0.55)' },
  groupTabText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '800' },
  groupTabTextOn: { color: AppColors.primary },
  card: { backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, borderCurve: 'continuous', overflow: 'hidden' },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: AppColors.border },
  rank: { width: 18, fontSize: 13, fontWeight: '700', color: AppColors.textSecondary, textAlign: 'center' },
  standName: { flex: 1, fontSize: 15, fontWeight: '600', color: AppColors.textPrimary },
  standDiff: { fontSize: 12, color: AppColors.textSecondary, minWidth: 34, textAlign: 'right' },
  standWins: { fontSize: 13, fontWeight: '700', color: '#16C784', minWidth: 34, textAlign: 'right' },
  tie: { backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, borderCurve: 'continuous', padding: 12 },
  tiePress: { gap: 8 },
  tieStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tieStatus: { color: AppColors.primary, fontSize: 10, fontWeight: '900' },
  tieHint: { color: AppColors.textMuted, fontSize: 10, fontWeight: '700' },
  tieHead: { flexDirection: 'row', alignItems: 'center' },
  tieName: { flex: 1, fontSize: 14, fontWeight: '700', color: AppColors.textPrimary },
  right: { textAlign: 'right' },
  win: { color: '#16A34A' },
  scoreBox: { minWidth: 48, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: AppColors.surfaceSoft, marginHorizontal: 8 },
  tieScore: { fontSize: 14, fontWeight: '900', color: AppColors.textPrimary },
  lineupButton: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 7, backgroundColor: AppColors.primary },
  lineupButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  court: { fontSize: 12, fontWeight: '700', color: '#2D6BD6', marginTop: 4 },
  sub: { backgroundColor: AppColors.surfaceSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  subTop: { flexDirection: 'row', justifyContent: 'space-between' },
  subKind: { fontSize: 13, color: AppColors.textSecondary },
  subResult: { fontSize: 13, fontWeight: '600', color: AppColors.textPrimary },
  lineup: { fontSize: 12, color: AppColors.textSecondary },
  lineupHidden: { fontSize: 12, color: AppColors.textMuted, fontStyle: 'italic' },
  emptyBox: { backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, borderCurve: 'continuous', padding: Spacing.four, marginTop: Spacing.two },
  emptyText: { fontSize: 14, color: AppColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  pending: { fontSize: 12, color: AppColors.textMuted, marginTop: 6 },
  treeHint: { color: AppColors.textMuted, fontSize: 11, lineHeight: 17, marginBottom: 8 },
  playerSearch: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.surface, marginBottom: 8 },
  playerSearchInput: { flex: 1, color: AppColors.textPrimary, fontSize: 14, paddingVertical: 0 },
  searchResultText: { color: AppColors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  searchEmpty: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.surface },
  searchEmptyText: { color: AppColors.textMuted, fontSize: 13, fontWeight: '700' },
  viewSwitch: { flexDirection: 'row', padding: 3, borderRadius: 8, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, marginBottom: 10 },
  viewSwitchButton: { flex: 1, minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 6 },
  viewSwitchButtonOn: { backgroundColor: 'rgba(22,199,132,0.13)' },
  viewSwitchText: { color: AppColors.textMuted, fontSize: 12, fontWeight: '800' },
  viewSwitchTextOn: { color: AppColors.textPrimary },
  knockoutList: { gap: 18 },
  roundTabs: { gap: 7, paddingBottom: 2 },
  roundTab: { minWidth: 76, height: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.surface },
  roundTabOn: { borderColor: 'rgba(22,199,132,0.55)', backgroundColor: 'rgba(22,199,132,0.13)' },
  roundTabText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '900' },
  roundTabTextOn: { color: AppColors.primary },
  roundTabCount: { color: AppColors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  roundTabCountOn: { color: AppColors.textSecondary },
  roundListSection: { gap: 8 },
  roundListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundListTitle: { color: AppColors.primary, fontSize: 13, fontWeight: '900' },
  roundListMeta: { color: AppColors.textMuted, fontSize: 11, fontWeight: '700' },
  roundListMatches: { gap: 8 },
  championBox: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: 'rgba(245,185,66,0.10)', borderWidth: 1, borderColor: 'rgba(245,185,66,0.28)' },
  championIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,185,66,0.13)' },
  championLabel: { color: '#F5B942', fontSize: 10, fontWeight: '900' },
  championName: { color: AppColors.textPrimary, fontSize: 15, fontWeight: '900', marginTop: 2 },
  treeScroll: { paddingVertical: 4, paddingRight: 4 },
  treeRoundLabel: { position: 'absolute', top: 0, color: AppColors.textSecondary, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  treeMatch: { position: 'absolute', borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: AppColors.surface },
  treeMatchSelected: { borderWidth: 2, borderColor: AppColors.primary },
  treeSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  treeSideDivider: { borderTopWidth: 1, borderTopColor: AppColors.border },
  treeTeam: { flex: 1, color: AppColors.textPrimary, fontSize: 11, fontWeight: '600' },
  treeBye: { color: AppColors.textMuted, fontWeight: '800' },
  treeScore: { minWidth: 13, color: AppColors.textSecondary, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  treeWinner: { color: AppColors.primary, fontWeight: '900' },
  matchSectionTitle: { color: AppColors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  modalSheet: { maxHeight: '88%', minHeight: '56%', borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: AppColors.background, borderWidth: 1, borderColor: AppColors.border, overflow: 'hidden' },
  modalHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: AppColors.border, marginTop: 8 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  modalEyebrow: { color: AppColors.primary, fontSize: 10, fontWeight: '900' },
  modalTitle: { color: AppColors.textPrimary, fontSize: 19, fontWeight: '900', marginTop: 2 },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: Spacing.four, paddingBottom: 36 },
  detailModalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, backgroundColor: 'rgba(0,0,0,0.7)' },
  detailModalCard: { width: '100%', maxHeight: '78%', borderRadius: 8, borderCurve: 'continuous', backgroundColor: AppColors.background, borderWidth: 1, borderColor: AppColors.border, overflow: 'hidden' },
  detailModalContent: { padding: Spacing.three, paddingBottom: Spacing.four },
});
