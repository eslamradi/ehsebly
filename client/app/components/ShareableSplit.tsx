import { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { SplitSummary } from './SplitSummary';
import { shareSplitText, type ShareableSplit as ShareableSplitData } from '../domain/share';
import { useI18n } from '../i18n';
import { spacing, useTheme } from '../theme';

type ShareableSplitProps = ShareableSplitData & {
  photoUris?: string[];
};

export type ShareableSplitHandle = {
  share: () => Promise<void>;
};

/**
 * Renders the same on-screen SplitSummary card, but wrapped in a captured
 * View so its `share()` handle can turn it into a PNG for the OS share
 * sheet — the fronter shares a clean split-card image instead of a
 * screenshot. Falls back to a plain-text share (`shareSplitText`) if the
 * image path fails for any reason (capture error, or no share target
 * available for a file on this platform).
 */
export const ShareableSplit = forwardRef<ShareableSplitHandle, ShareableSplitProps>(function ShareableSplit(
  { photoUris, items, taxService, people, itemAssignments },
  ref,
) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const captureViewRef = useRef<View>(null);

  useImperativeHandle(ref, () => ({
    share: async () => {
      const split = { items, taxService, people, itemAssignments };
      try {
        const uri = await captureRef(captureViewRef, { format: 'png', quality: 1 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: t('share.dialogTitle') });
          return;
        }
      } catch {
        // Capture or platform share failure — fall through to text below.
      }
      await shareSplitText(split, t);
    },
  }));

  return (
    // collapsable={false} keeps Android from flattening this View out of
    // the native tree, which would leave captureRef nothing to snapshot.
    <View ref={captureViewRef} collapsable={false} style={{ backgroundColor: colors.paper, gap: spacing.lg }}>
      <SplitSummary
        photoUris={photoUris}
        items={items}
        taxService={taxService}
        people={people}
        itemAssignments={itemAssignments}
      />
    </View>
  );
});
