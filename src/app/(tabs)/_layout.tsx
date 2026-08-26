import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand } from '@/constants/theme';
import { AppColors } from '@/theme';

type TabIconProps = {
  focused: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon?: keyof typeof Ionicons.glyphMap;
  label: string;
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 16);

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        // 탭 씬(화면 뒷면) 배경을 앱 다크로 고정 → 탭 전환/lazy 마운트 때 라이트 배경이
        // 한 프레임 비쳐 깜빡이던 문제 제거.
        sceneStyle: { backgroundColor: AppColors.background },
        tabBarShowLabel: false,
        tabBarActiveTintColor: Brand.primary,
        tabBarInactiveTintColor: '#707B87',
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 70 + bottomInset,
          paddingTop: 0,
          paddingBottom: bottomInset,
          paddingHorizontal: 16,
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          borderCurve: 'continuous',
          backgroundColor: 'rgba(16,22,29,0.98)',
          borderTopWidth: 0,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderLeftWidth: 0,
          borderRightWidth: 0,
          borderColor: 'rgba(255,255,255,0.10)',
          boxShadow: '0 -10px 28px rgba(0, 0, 0, 0.34)',
        },
        tabBarIconStyle: styles.tabIcon,
        tabBarItemStyle: styles.tabItem,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="home-outline" activeIcon="home" label="홈" />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: '모임',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="flash-outline" activeIcon="flash" label="모임" />
          ),
        }}
      />
      <Tabs.Screen
        name="court"
        options={{
          title: '코트',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="location-outline" activeIcon="location" label="코트" />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: '커뮤니티',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon="chatbubble-ellipses-outline"
              activeIcon="chatbubble-ellipses"
              label="커뮤니티"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '전체',
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon="menu-outline" activeIcon="menu" label="전체" />
          ),
        }}
      />
      <Tabs.Screen
        name="clubs"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ focused, icon, activeIcon, label }: TabIconProps) {
  return (
    <View style={styles.itemInner}>
      <View style={[styles.iconShell, focused && styles.iconShellActive]}>
        <Ionicons name={focused ? activeIcon ?? icon : icon} size={focused ? 20 : 19} color={focused ? '#07110C' : '#707B87'} />
      </View>
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    minWidth: 0,
    paddingHorizontal: 0,
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInner: {
    width: 54,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconShell: {
    width: 32,
    height: 28,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  iconShellActive: {
    backgroundColor: '#9BE137',
    boxShadow: '0 6px 18px rgba(155, 225, 55, 0.34)',
  },
  label: {
    maxWidth: 54,
    fontSize: 10,
    fontWeight: '800',
    color: '#707B87',
    letterSpacing: 0,
  },
  labelActive: {
    color: '#F8FAFC',
  },
});
