import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  type CameraCapturedPicture,
  type PermissionResponse,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { extractReceipt } from '../api/extractReceipt';
import { useSplitSession } from '../domain/session';
import { calculateSubtotalPiastres, computeInitialTaxServiceSettings } from '../domain/splitCalculation';
import { fonts, radii, spacing, useTheme } from '../theme';
import { useI18n } from '../i18n';
import { MAX_PHOTOS } from '../api/limits';
import { ScanningViewfinder } from '../components/ScanningViewfinder';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Capture'>;

const GALLERY_PHOTO_MAX_WIDTH = 2000;
// Mirrors the Worker's own MAX_IMAGES cap (index.ts) — stopping here means
// the fronter sees a clear "up to 8" limit instead of tapping past it and
// only finding out from a 400 after the whole batch uploads.


/**
 * Reached from HomeScreen — either "Take Photo" (opens straight to the live
 * camera) or "Choose from Gallery" (auto-launches the picker on mount via
 * `route.params.openGalleryOnMount`, so the gallery-pick entry point lives
 * on the home screen without duplicating the picker/HEIC-normalization
 * logic there).
 *
 * Supports a multi-photo receipt (a long paper receipt shot in pieces, or
 * several scrolled screenshots of one delivery-app order): each camera shot
 * or gallery pick adds to a pending batch reviewed as a thumbnail strip —
 * "Add Another (Camera)" and "Add from Gallery" both loop back for more (and
 * can be mixed freely), "Use These Photos" commits the whole batch to the
 * session and sends all of them to extraction together.
 */
export default function CaptureScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { colors, insets, buttonStyles, screenStyles } = theme;
  const { t } = useI18n();

  // useCameraPermissions returns a 3-tuple: [status, requestPermission, getPermission].
  // `getPermission` re-checks status without prompting the OS dialog — use it on
  // foreground transitions since `permission` does not reliably auto-refresh when
  // the user grants/revokes camera access from device Settings while backgrounded.
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [freshPermission, setFreshPermission] = useState<PermissionResponse | null>(permission);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pickingFromGallery, setPickingFromGallery] = useState(false);
  // Shared between the capture and gallery-pick paths — only one of them can
  // be in flight at a time (both live behind the same live-camera view), so a
  // single error avoids two banners ever needing to stack.
  const [error, setError] = useState<{ message: string; showSettingsLink: boolean } | null>(null);
  // Photos taken/picked so far, not yet committed to the session. Reviewed
  // as a thumbnail strip once at least one exists.
  const [pendingUris, setPendingUris] = useState<string[]>([]);
  // Whether the live camera should render right now — true initially and
  // after "Add Another"; false once a photo lands in pendingUris, so the
  // fronter sees the review strip instead of the camera reopening itself.
  // Starts false for a gallery-only entry (route.params.openGalleryOnMount)
  // so the camera never mounts underneath the gallery picker — previously
  // it always started true, so the live camera preview ran behind the
  // picker modal even when the fronter only wanted to pick from their
  // gallery (found via real-device testing).
  const [showingCamera, setShowingCamera] = useState(!route.params?.openGalleryOnMount);
  const [confirmedUris, setConfirmedUris] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  // Guards the gallery-auto-open effect below so it only fires once per
  // navigation into this screen — also doubles as "has the gallery-only
  // entry already had its one shot", so a later refocus (e.g. retrying
  // after a failed extraction) falls back to showing the camera instead of
  // silently re-suppressing it with no picker re-triggering.
  const openedGalleryOnMountRef = useRef(false);
  // Synchronous re-entry guard for handleUseThesePhotos. React state
  // (`extracting`) updates asynchronously, so a rapid double-tap on "Use
  // These Photos" can invoke it twice before a re-render ever removes the
  // button — a ref mutates immediately and closes that window regardless of
  // render timing (code review finding, Story 1.2).
  const confirmingRef = useRef(false);
  const { session, setPhotos, clearPhoto, setExtractionResult, setTaxService } = useSplitSession();

  // The reading screen is app surface rather than camera chrome, so unlike
  // the module-level sheet below it follows the theme.
  const scanStyles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: theme.colors.paper,
          paddingHorizontal: 26,
          paddingTop: 10 + theme.insets.top,
          paddingBottom: 26 + theme.insets.bottom,
        },
        heading: {
          fontFamily: theme.fonts.headingSemiBold,
          fontSize: 29,
          color: theme.colors.ink,
          marginTop: 10,
          marginBottom: 14,
        },
        actions: { paddingTop: 18 },
      }),
    [theme],
  );

  useEffect(() => {
    setFreshPermission(permission);
  }, [permission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        try {
          const current = await getPermission();
          setFreshPermission(current);
        } catch {
          // Keep the previously-known permission state rather than crash on
          // a transient OS-level check failure.
        }
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  // This screen stays mounted underneath ExtractedItems/ExtractionFailed/
  // ManualEntry (native-stack doesn't unmount screens below the top of the
  // stack). Those screens clear session.photoUris before navigating back
  // here (e.g. ExtractionFailedScreen's "Retry"), but that doesn't touch
  // this screen's own local pendingUris/confirmedUris — without this, the
  // fronter would land back on a stale "photos captured" view instead of
  // the live camera. Reset local capture state whenever this screen
  // regains focus with no photos committed to the session. Defaults to the
  // camera even on a gallery-only entry once the gallery's one auto-open
  // shot has already fired (openedGalleryOnMountRef) — otherwise a retry
  // would land on a dead screen with neither the camera nor a re-triggered
  // picker.
  useFocusEffect(
    useCallback(() => {
      if (session.photoUris.length === 0) {
        setPendingUris([]);
        setConfirmedUris([]);
        setShowingCamera(openedGalleryOnMountRef.current || !route.params?.openGalleryOnMount);
      }
    }, [session.photoUris, route.params?.openGalleryOnMount]),
  );

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    // expo-camera's own docs require waiting for onCameraReady before calling
    // takePictureAsync; also guard against rapid double-taps firing concurrent
    // capture calls.
    if (!camera || !cameraReady || capturing) {
      return;
    }
    if (pendingUris.length >= MAX_PHOTOS) {
      setError({ message: t('capture.maxPhotos', { max: MAX_PHOTOS }), showSettingsLink: false });
      return;
    }
    setCapturing(true);
    setError(null);
    try {
      const photo: CameraCapturedPicture | undefined = await camera.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        setPendingUris((previous) => [...previous, photo.uri]);
        setShowingCamera(false);
      } else {
        setError({ message: t('capture.captureFailed'), showSettingsLink: false });
      }
    } catch {
      setError({ message: t('capture.captureFailed'), showSettingsLink: false });
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing, pendingUris.length]);

  const handlePickFromGallery = useCallback(async () => {
    if (pickingFromGallery) {
      return;
    }
    // Reachable both from an empty batch (HomeScreen's "Choose from
    // Gallery") and from the review screen's "Add from Gallery" once some
    // photos already exist — cap against what's already pending, not just
    // this one picker visit, so combining camera + gallery photos can't
    // exceed the Worker's own per-request limit.
    if (pendingUris.length >= MAX_PHOTOS) {
      setError({ message: t('capture.maxPhotos', { max: MAX_PHOTOS }), showSettingsLink: false });
      return;
    }
    setPickingFromGallery(true);
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        // A gallery-only entry (openGalleryOnMount) never mounted the
        // camera — with nothing pending yet, just leave rather than
        // dropping into the camera the fronter never asked for.
        if (pendingUris.length === 0) {
          clearPhoto();
          navigation.goBack();
          return;
        }
        setError(
          permission.canAskAgain
            ? { message: t('capture.photoPermission'), showSettingsLink: false }
            : {
                message: t('capture.photoAccessOff'),
                showSettingsLink: true,
              },
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: MAX_PHOTOS - pendingUris.length,
      });
      if (result.canceled || result.assets.length === 0) {
        // Same as above — backing out of a gallery-only entry with nothing
        // picked yet just leaves, no camera fallback.
        if (pendingUris.length === 0) {
          clearPhoto();
          navigation.goBack();
        }
        return;
      }
      // The gallery can hand back HEIC (Apple's native photo format, unlike
      // expo-camera's capture which is always JPEG) — the vision-LLM API
      // only accepts JPEG/PNG/GIF/WEBP and rejects HEIC outright, so always
      // re-encode to JPEG regardless of the source format. Also cap the
      // width so a full-resolution gallery photo doesn't blow the
      // extraction timeout on a slow connection.
      const normalized = await Promise.all(
        result.assets.map((asset) =>
          ImageManipulator.manipulateAsync(
            asset.uri,
            asset.width > GALLERY_PHOTO_MAX_WIDTH ? [{ resize: { width: GALLERY_PHOTO_MAX_WIDTH } }] : [],
            { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 },
          ),
        ),
      );
      setPendingUris((previous) => [...previous, ...normalized.map((image) => image.uri)]);
      setShowingCamera(false);
    } catch {
      if (pendingUris.length === 0) {
        clearPhoto();
        navigation.goBack();
      } else {
        setError({ message: t('capture.openPhotosFailed'), showSettingsLink: false });
      }
    } finally {
      setPickingFromGallery(false);
    }
  }, [pickingFromGallery, pendingUris.length, clearPhoto, navigation]);

  // HomeScreen's "Choose from Gallery" (and GroupDetailScreen's "Log Expense
  // from Gallery") navigate here with this flag rather than duplicating the
  // picker logic itself — fires once per navigation into this screen with
  // the flag set, not on every re-render.
  useEffect(() => {
    if (route.params?.openGalleryOnMount && !openedGalleryOnMountRef.current) {
      openedGalleryOnMountRef.current = true;
      handlePickFromGallery();
    }
  }, [route.params?.openGalleryOnMount, handlePickFromGallery]);

  const handleAddAnother = useCallback(() => {
    setError(null);
    setShowingCamera(true);
  }, []);

  const handleRetakeAll = useCallback(() => {
    setPendingUris([]);
    setConfirmedUris([]);
    setShowingCamera(true);
    // Confirming photos commits them to the shared session (setPhotos);
    // retaking must undo that commitment too, or the session keeps pointing
    // at photos the fronter just rejected.
    clearPhoto();
  }, [clearPhoto]);

  const handleUseThesePhotos = useCallback(async () => {
    if (pendingUris.length === 0 || confirmingRef.current) {
      return;
    }
    confirmingRef.current = true;
    try {
      // Mutate session state only through the domain-layer action — never
      // set state directly here beyond this screen's own local UI state.
      setPhotos(pendingUris);
      setConfirmedUris(pendingUris);

      // Confirming the photos is the handoff point to extraction (Story 1.1
      // AC #2) — hand off immediately rather than waiting for a separate
      // user action.
      setExtracting(true);
      const result = await extractReceipt(pendingUris);
      setExtractionResult(result);
      setExtracting(false);

      if (result.status === 'ok') {
        // Seed the charge rates here rather than on the next screen's
        // Continue press: since the flow consolidation the check screen
        // renders the rate editors on mount, so they have to be populated
        // before it opens. The guard is what stops a retake-and-return from
        // clobbering rates the fronter has already hand-edited.
        if (!session.taxService) {
          // The subtotal is needed to tell the two tax conventions apart:
          // whether the printed tax amount is the rate applied to the subtotal
          // or to the subtotal plus service.
          setTaxService(
            computeInitialTaxServiceSettings({
              ...result,
              subtotalPiastres: calculateSubtotalPiastres(result.items),
              printedSubtotalPiastres: result.printedSubtotalPiastres,
            }),
          );
        }
        navigation.navigate('ExtractedItems');
      } else {
        navigation.navigate('ExtractionFailed');
      }
    } finally {
      confirmingRef.current = false;
    }
    // `session.taxService` is a real dependency, not decoration: without it
    // this closure keeps whatever value it saw when it was created, so a
    // retake-and-return would read a stale `undefined` and re-seed over
    // rates the fronter had already edited.
  }, [pendingUris, navigation, setExtractionResult, setPhotos, session.taxService, setTaxService]);

  // Camera permission is only required when we actually intend to show the
  // camera — a gallery-only entry (openGalleryOnMount) must never be
  // blocked by an irrelevant "grant camera access" gate.
  if (showingCamera && !freshPermission) {
    // Permission status still loading — render nothing rather than a
    // flash of the wrong state.
    return <View style={screenStyles.center} />;
  }

  if (showingCamera && freshPermission && !freshPermission.granted) {
    if (freshPermission.canAskAgain) {
      return (
        <View style={screenStyles.center}>
          <Text style={screenStyles.message}>asemly needs your camera to photograph a receipt.</Text>
          <Pressable accessibilityLabel={t('capture.grantCameraAction')} style={buttonStyles.primary} onPress={requestPermission}>
            <Text style={buttonStyles.primaryText}>{t('capture.grantCameraAction')}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={screenStyles.center}>
        <Text style={screenStyles.message}>
          Camera access is off, so asemly can&apos;t photograph a receipt. Turn it on in
          Settings to continue.
        </Text>
        <Pressable accessibilityLabel={t('capture.a11yOpenSettings')} style={buttonStyles.primary} onPress={() => Linking.openSettings()}>
          <Text style={buttonStyles.primaryText}>{t('capture.openSettings')}</Text>
        </Pressable>
      </View>
    );
  }

  if (confirmedUris.length > 0) {
    // The redesign's reading state: the receipt in a dark viewfinder with a
    // band of light sweeping down it, and the status inside the frame rather
    // than as a caption underneath a spinner.
    return (
      <View style={scanStyles.screen}>
        <Text style={scanStyles.heading}>{t('capture.snapTitle')}</Text>
        <ScanningViewfinder
          uri={confirmedUris[0]}
          scanning={extracting}
          a11yLabel={t('capture.a11yPhotoPreview')}
          caption={
            extracting
              ? t('capture.reading', { count: confirmedUris.length })
              : t('capture.captured', { count: confirmedUris.length })
          }
        />
        <View style={scanStyles.actions}>
          <Pressable
            accessibilityLabel={t('capture.a11yRetakePhotos')}
            style={[buttonStyles.secondary, extracting && buttonStyles.disabled]}
            disabled={extracting}
            onPress={handleRetakeAll}
          >
            <Text style={buttonStyles.secondaryText}>{t('capture.retake')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!showingCamera && pendingUris.length === 0) {
    // Gallery-only entry, picker still in flight — a transient neutral
    // state so the live camera never renders underneath the gallery
    // picker. Every exit from the picker with nothing picked (cancelled,
    // denied, or errored) navigates back rather than landing here, so this
    // is only ever visible for the brief moment the picker is opening.
    return (
      <View style={screenStyles.center}>
        {pickingFromGallery && <ActivityIndicator accessibilityLabel={t('capture.a11yOpeningPhotos')} color={colors.accent} />}
      </View>
    );
  }

  if (pendingUris.length > 0 && !showingCamera) {
    return (
      <View style={screenStyles.center}>
        <PhotoPreview uris={pendingUris} styles={styles} />
        <Text style={screenStyles.message}>
          {pendingUris.length} {pendingUris.length === 1 ? 'photo' : 'photos'}
        </Text>
        {error && <Text style={[screenStyles.message, { color: colors.critical }]}>{error.message}</Text>}
        <View style={styles.column}>
          <Pressable accessibilityLabel={t('capture.a11yUsePhotos')} style={buttonStyles.primary} onPress={handleUseThesePhotos}>
            <Text style={buttonStyles.primaryText}>{t('capture.usePhotos', { count: pendingUris.length })}</Text>
          </Pressable>
          <Pressable accessibilityLabel={t('capture.a11yAddAnotherCamera')} style={buttonStyles.secondary} onPress={handleAddAnother}>
            <Text style={buttonStyles.secondaryText}>{t('capture.addAnotherCamera')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('capture.a11yAddFromGallery')}
            style={[buttonStyles.secondary, pickingFromGallery && buttonStyles.disabled]}
            disabled={pickingFromGallery}
            onPress={handlePickFromGallery}
          >
            <Text style={buttonStyles.secondaryText}>{t('capture.addFromGallery')}</Text>
          </Pressable>
          <Pressable accessibilityLabel={t('capture.a11yRetakeAll')} style={buttonStyles.secondary} onPress={handleRetakeAll}>
            <Text style={buttonStyles.secondaryText}>{t('capture.retakeAll')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
      />
      {error && (
        <View style={[styles.errorBanner, { top: insets.top + 16 }]}>
          {/* The chrome block below is intentionally theme-free (fixed camera
              overlay colours), but its *text* can be Arabic, which the Latin
              families can't render — so the locale face is applied here. */}
          <Text style={[styles.errorText, { fontFamily: theme.fonts.sansRegular }]}>{error.message}</Text>
          {error.showSettingsLink && (
            <Pressable accessibilityLabel={t('capture.a11yOpenSettings')} onPress={() => Linking.openSettings()}>
              <Text style={[styles.errorSettingsLink, { fontFamily: theme.fonts.sansSemiBold }]}>
                {t('capture.openSettings')}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={[styles.controls, { bottom: 44 + insets.bottom }]}>
        <Pressable
          accessibilityLabel={t('capture.a11yCapturePhoto')}
          style={[styles.captureButton, (!cameraReady || capturing) && styles.captureButtonDisabled]}
          disabled={!cameraReady || capturing}
          onPress={handleCapture}
        >
          <View style={styles.captureButtonInner} />
        </Pressable>
      </View>
    </View>
  );
}

/** One big preview for the common single-photo case, a horizontal thumbnail strip once there's more than one. */
function PhotoPreview({ uris, styles: photoStyles }: { uris: string[]; styles: typeof styles }) {
  const { t } = useI18n();
  if (uris.length === 1) {
    return <Image accessibilityLabel={t('capture.a11yCapturedPhoto')} source={{ uri: uris[0] }} style={photoStyles.preview} />;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={photoStyles.thumbStripContent}>
      {uris.map((uri, index) => (
        <Image
          key={uri}
          accessibilityLabel={t('capture.a11yCapturedPhotoIndexed', { index: index + 1, total: uris.length })}
          source={{ uri }}
          style={photoStyles.thumb}
        />
      ))}
    </ScrollView>
  );
}

// Fixed (not theme-dependent) neutrals — this is chrome overlaid on a live
// camera feed, not app reading content, so it stays the same white
// shutter/dark banner regardless of light/dark mode (same convention as the
// OS Camera app).
const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  column: { width: '100%', gap: spacing.md },
  controls: {
    // `bottom` is set inline per-render (needs the device's safe-area inset).
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  captureButtonDisabled: { opacity: 0.5 },
  errorBanner: {
    // `top` is set inline per-render (needs the device's safe-area inset).
    position: 'absolute',
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.sansRegular,
    backgroundColor: 'rgba(28,27,25,0.85)',
    color: '#FFFFFF',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  errorSettingsLink: {
    fontFamily: fonts.sansSemiBold,
    backgroundColor: '#FFFFFF',
    color: '#1C1B19',
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  preview: { width: 280, height: 373, borderRadius: radii.lg, marginBottom: spacing.lg },
  thumbStripContent: { gap: spacing.sm, marginBottom: spacing.lg },
  thumb: { width: 140, height: 187, borderRadius: radii.lg, resizeMode: 'cover' },
});
