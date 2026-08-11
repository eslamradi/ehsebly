import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountProvider } from './app/domain/account';
import { SplitSessionProvider } from './app/domain/session';
import { I18nProvider, useI18n } from './app/i18n';
import { useTheme } from './app/theme';
import { GROUPS_ENABLED } from './app/featureFlags';
import type { MainTabParamList, RootStackParamList } from './app/navigation/types';
import AccountScreen from './app/screens/AccountScreen';
import CaptureScreen from './app/screens/CaptureScreen';
import CreateGroupScreen from './app/screens/CreateGroupScreen';
import ExpenseDetailScreen from './app/screens/ExpenseDetailScreen';
import ExpenseEditScreen from './app/screens/ExpenseEditScreen';
import ExtractedItemsScreen from './app/screens/ExtractedItemsScreen';
import ExtractionFailedScreen from './app/screens/ExtractionFailedScreen';
import FinalSplitScreen from './app/screens/FinalSplitScreen';
import GroupDetailScreen from './app/screens/GroupDetailScreen';
import GroupListScreen from './app/screens/GroupListScreen';
import HistoryDetailScreen from './app/screens/HistoryDetailScreen';
import HistoryScreen from './app/screens/HistoryScreen';
import EmailEntryScreen from './app/screens/EmailEntryScreen';
import HomeScreen from './app/screens/HomeScreen';
import InviteMemberScreen from './app/screens/InviteMemberScreen';
import ItemAssignmentScreen from './app/screens/ItemAssignmentScreen';
import ManualEntryScreen from './app/screens/ManualEntryScreen';
import OtpVerifyScreen from './app/screens/OtpVerifyScreen';
import SettleUpScreen from './app/screens/SettleUpScreen';

export type { RootStackParamList };

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * The persistent destinations. Everything reachable from here without losing
 * your place: where you start a breakdown, what you have already split, your
 * groups, and your account.
 *
 * The bar is deliberately absent from the split flow itself — those screens
 * are pushed onto the stack above this navigator.
 */
/**
 * Outline when idle, solid when selected — the platform convention, and it
 * carries the selected state without relying on colour alone.
 */
function tabIcon(idle: keyof typeof Ionicons.glyphMap, active: keyof typeof Ionicons.glyphMap) {
  return function TabBarIcon({ color, size, focused }: { color: string; size: number; focused: boolean }) {
    return <Ionicons name={focused ? active : idle} size={size} color={color} />;
  };
}

function MainTabs() {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.paperRaised, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('receipt-outline', 'receipt') }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: t('tabs.history'), tabBarIcon: tabIcon('time-outline', 'time') }}
      />
      {GROUPS_ENABLED ? (
        <Tab.Screen
          name="GroupList"
          component={GroupListScreen}
          options={{ title: t('tabs.groups'), tabBarIcon: tabIcon('people-outline', 'people') }}
        />
      ) : null}
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: t('tabs.account'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
      />
    </Tab.Navigator>
  );
}

/**
 * `useTheme()` calls `useSafeAreaInsets()`, which needs a `SafeAreaProvider`
 * ancestor — split into an outer/inner component rather than calling
 * `useTheme()` directly in the exported `App`, which would run before any
 * provider it renders itself could take effect.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AppContent />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { colors, isDark } = useTheme();
  const { ready: localeReady } = useI18n();
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
    // Loaded unconditionally rather than per-locale: useFonts takes a fixed
    // map, and swapping it mid-session would unload the faces already on
    // screen. Four extra files is a cheaper trade than a font pop on switch.
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  // Every screen's styles reference these exact family names (see
  // theme.ts's `fonts`) — render a plain paper-colored blank instead of the
  // tree until they're in, rather than a flash of fallback system fonts
  // that would re-layout a beat later once the real ones swap in.
  // Also gated on the stored locale, so the first paint is never the wrong
  // language (or the wrong writing direction) for a frame before correcting.
  if (!fontsLoaded || !localeReady) {
    return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  }

  // Matches the app's paper/dark palette (whichever the OS is currently in)
  // so the brief gap shown during a screen transition, and the area behind
  // any translucent nav chrome, never flashes react-navigation's static
  // default light/dark colors instead of ours.
  const navigationTheme: Theme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.paper,
      card: colors.paperRaised,
      border: colors.line,
    },
  };

  return (
    <AccountProvider>
      <SplitSessionProvider>
        <NavigationContainer theme={navigationTheme}>
          <Stack.Navigator
            initialRouteName="Tabs"
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
          >
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen name="Capture" component={CaptureScreen} />
            <Stack.Screen name="ExtractedItems" component={ExtractedItemsScreen} />
            <Stack.Screen name="ExtractionFailed" component={ExtractionFailedScreen} />
            <Stack.Screen name="ManualEntry" component={ManualEntryScreen} />
            <Stack.Screen name="ItemAssignment" component={ItemAssignmentScreen} />
            <Stack.Screen name="FinalSplit" component={FinalSplitScreen} />
            <Stack.Screen name="HistoryDetail" component={HistoryDetailScreen} />
            <Stack.Screen name="EmailEntry" component={EmailEntryScreen} />
            <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />
            <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
            <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
            <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
            <Stack.Screen name="ExpenseEdit" component={ExpenseEditScreen} />
            <Stack.Screen name="InviteMember" component={InviteMemberScreen} />
            <Stack.Screen name="SettleUp" component={SettleUpScreen} />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </SplitSessionProvider>
    </AccountProvider>
  );
}
