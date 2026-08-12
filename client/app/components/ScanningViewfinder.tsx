import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { spacing, useTheme, type Theme } from '../theme';

function makeStyles(theme: Theme) {
  const { colors } = theme;
  return StyleSheet.create({
    // The viewfinder is deliberately near-black whatever the app theme is:
    // in the design it is the dark hole the receipt sits in, and the
    // scanline only reads as light sweeping across against ink.
    frame: {
      flex: 1,
      borderRadius: 34,
      backgroundColor: '#2E2B25',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photo: { width: '70%', height: '80%', borderRadius: 14, backgroundColor: '#F6F1E6' },
    // top:0 is load-bearing. The frame centres its children, so an absolute
    // child without it resolves to the centred static position and the
    // sweep starts half a frame down, then clips out of the bottom.
    scanline: { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
    caption: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 16,
      textAlign: 'center',
      fontSize: 13,
      color: '#F0E7D6',
      fontFamily: theme.fonts.sansRegular,
    },
    accentBand: { flex: 1, backgroundColor: colors.accent },
  });
}

/**
 * The receipt sitting in a dark viewfinder, with a band of accent light
 * sweeping down it while extraction runs.
 *
 * From the redesign: a 60pt gradient travelling from just above the frame to
 * well past its bottom on a 1.1s loop, over a caption that switches between
 * "Tap the shutter" and "Reading your receipt…". It replaces a centred
 * spinner, which said only that something was happening — this says what is
 * happening to the thing you are looking at.
 */
export function ScanningViewfinder({
  uri,
  scanning,
  caption,
  a11yLabel,
}: {
  uri?: string;
  scanning: boolean;
  caption: string;
  a11yLabel: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const travel = useRef(new Animated.Value(0)).current;
  // Measured rather than assumed: the design's -10%/560% is relative to a
  // phone-height frame, and a fixed distance leaves the band short on a
  // taller one and running past a shorter one.
  const [frameHeight, setFrameHeight] = useState(0);

  useEffect(() => {
    if (!scanning) {
      travel.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(travel, {
        toValue: 1,
        duration: 1100,
        // The design's ease-in-out: the band lingers at both edges rather
        // than crossing at a constant speed.
        easing: Easing.inOut(Easing.ease),
        // react-native-web has no native driver, and asking for one there
        // makes the timing resolve instantly — the band lands on its end
        // value and never sweeps. Native keeps the driver.
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    loop.start();
    return () => loop.stop();
    // Deliberately not keyed on frameHeight: onLayout can fire more than
    // once (the photo loading re-lays it out), and restarting the loop each
    // time resets the band to the top so it never appears to move. The
    // height feeds the interpolation below instead, which updates without
    // touching the running animation.
  }, [scanning, travel]);

  return (
    <View
      style={styles.frame}
      onLayout={(event) => setFrameHeight(event.nativeEvent.layout.height)}
    >
      {uri ? <Image accessibilityLabel={a11yLabel} source={{ uri }} style={styles.photo} resizeMode="cover" /> : null}

      {scanning && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.scanline,
            {
              transform: [
                {
                  translateY: travel.interpolate({
                    inputRange: [0, 1],
                    // Starts just above the frame and finishes just past its
                    // bottom edge, so the sweep covers the whole receipt
                    // whatever height the frame ends up.
                    outputRange: [-60, frameHeight || 400],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Three stops approximating the design's transparent-to-accent-to-
              transparent gradient without pulling in a gradient dependency
              for one band of light. */}
          <View style={{ flex: 1, backgroundColor: theme.colors.accent, opacity: 0.12 }} />
          <View style={{ flex: 1, backgroundColor: theme.colors.accent, opacity: 0.34 }} />
          <View style={{ flex: 1, backgroundColor: theme.colors.accent, opacity: 0.55 }} />
          <View style={{ flex: 1, backgroundColor: theme.colors.accent, opacity: 0.34 }} />
          <View style={{ flex: 1, backgroundColor: theme.colors.accent, opacity: 0.12 }} />
        </Animated.View>
      )}

      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}
