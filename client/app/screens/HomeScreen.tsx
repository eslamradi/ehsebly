import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fonts, spacing, useTheme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

/**
 * The app's true landing page — camera capture, gallery picking, and
 * history are all reached from here rather than living on the camera
 * screen itself (that screen now only opens once the fronter has picked
 * how they want to start).
 */
export default function HomeScreen({ navigation }: Props) {
  const { colors, insets, buttonStyles } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.paper,
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingTop: 56 + insets.top,
          paddingBottom: 32 + insets.bottom,
        },
        brand: { alignItems: 'center', gap: 14 },
        logo: { width: 68, height: 68, borderRadius: 16 },
        title: { fontFamily: fonts.headingSemiBold, fontSize: 27, color: colors.ink, letterSpacing: -0.2 },
        subtitle: { fontFamily: fonts.sansRegular, fontSize: 13.5, color: colors.inkSoft },
        actions: { gap: 10 },
        ghostButton: { paddingVertical: 14, alignItems: 'center' },
        ghostButtonText: { fontFamily: fonts.sansMedium, color: colors.inkSoft, fontSize: 15 },
      }),
    [colors, insets],
  );

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image accessibilityLabel="ehsebly logo" source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>ehsebly</Text>
        <Text style={styles.subtitle}>Split a receipt in a few taps.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Take a photo of a receipt"
          style={buttonStyles.primary}
          onPress={() => navigation.navigate('Capture', undefined)}
        >
          <Text style={buttonStyles.primaryText}>Take Photo</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Choose photo from gallery"
          style={buttonStyles.secondary}
          onPress={() => navigation.navigate('Capture', { openGalleryOnMount: true })}
        >
          <Text style={buttonStyles.secondaryText}>Choose from Gallery</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="View split history"
          style={styles.ghostButton}
          onPress={() => navigation.navigate('History')}
        >
          <Text style={styles.ghostButtonText}>History</Text>
        </Pressable>
      </View>
    </View>
  );
}
