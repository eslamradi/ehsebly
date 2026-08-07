import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import type { RootStackParamList } from './app/navigation/types';
import AccountScreen from './app/screens/AccountScreen';
import CaptureScreen from './app/screens/CaptureScreen';
import CasualSplitScreen from './app/screens/CasualSplitScreen';
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
import ReviewScreen from './app/screens/ReviewScreen';
import SettleUpScreen from './app/screens/SettleUpScreen';
import TaxServiceScreen from './app/screens/TaxServiceScreen';

export type { RootStackParamList };

const Stack = createNativeStackNavigator<RootStackParamList>();

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
            initialRouteName="Home"
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}
          >
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="CasualSplit" component={CasualSplitScreen} />
            <Stack.Screen name="Capture" component={CaptureScreen} />
            <Stack.Screen name="ExtractedItems" component={ExtractedItemsScreen} />
            <Stack.Screen name="ExtractionFailed" component={ExtractionFailedScreen} />
            <Stack.Screen name="ManualEntry" component={ManualEntryScreen} />
            <Stack.Screen name="TaxService" component={TaxServiceScreen} />
            <Stack.Screen name="ItemAssignment" component={ItemAssignmentScreen} />
            <Stack.Screen name="Review" component={ReviewScreen} />
            <Stack.Screen name="FinalSplit" component={FinalSplitScreen} />
            <Stack.Screen name="History" component={HistoryScreen} />
            <Stack.Screen name="HistoryDetail" component={HistoryDetailScreen} />
            <Stack.Screen name="EmailEntry" component={EmailEntryScreen} />
            <Stack.Screen name="OtpVerify" component={OtpVerifyScreen} />
            <Stack.Screen name="GroupList" component={GroupListScreen} />
            <Stack.Screen name="Account" component={AccountScreen} />
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
