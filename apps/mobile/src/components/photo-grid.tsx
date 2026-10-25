import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import {
  MAX_PHOTOS,
  MediaError,
  listPhotos,
  pickFromCamera,
  pickFromGallery,
  removePhoto,
  uploadPhoto,
  type PhotoAsset,
} from '@/api/media';
import { Button, Notice, Row } from '@/components/ui';
import { useLocale } from '@/i18n/locale-provider';
import type { TranslationKey } from '@/i18n/messages';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const STATUS_KEYS: Record<string, TranslationKey> = {
  approved: 'photos.approved',
  pending: 'photos.pending',
  rejected: 'photos.rejected',
};

export function PhotoGrid({ value, onChange }: { value: string[]; onChange: (urls: string[]) => void }) {
  const { t } = useLocale();
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAssets(await listPhotos());
      setErrorKey(null);
    } catch {
      setErrorKey('photos.processFailed');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Вибраними лишаються лише ті URL, що щойно пройшли модерaцію (PhotoUploader.vue:7-10).
  useEffect(() => {
    const approved = new Set(assets.filter((asset) => asset.status === 'approved').map((asset) => asset.publicUrl));
    const pruned = value.filter((url) => approved.has(url));
    if (pruned.length !== value.length) onChange(pruned);
  }, [assets, onChange, value]);

  const upload = async (fromCamera: boolean) => {
    if (assets.filter((asset) => asset.status !== 'rejected').length >= MAX_PHOTOS) {
      setErrorKey('photos.tooMany');
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      const image = fromCamera ? await pickFromCamera() : await pickFromGallery();
      if (image) await uploadPhoto(image);
      await refresh();
    } catch (error) {
      setErrorKey(error instanceof MediaError ? error.messageKey : 'photos.processFailed');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (asset: PhotoAsset) => {
    setErrorKey(null);
    const next = value.includes(asset.publicUrl)
      ? value.filter((url) => url !== asset.publicUrl)
      : [...value, asset.publicUrl];
    if (next.length > MAX_PHOTOS) return;
    onChange(next);
  };

  const drop = async (asset: PhotoAsset) => {
    setBusy(true);
    setErrorKey(null);
    try {
      await removePhoto(asset.id);
      await refresh();
    } catch {
      setErrorKey('photos.removeFailed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Row>
        <Button variant="secondary" label={t('photos.gallery')} onPress={() => void upload(false)} busy={busy} />
        <Button variant="secondary" label={t('photos.camera')} onPress={() => void upload(true)} busy={busy} />
      </Row>
      <Text style={styles.hint}>{t('photos.hint')}</Text>
      {busy ? <Notice kind="status">{t('photos.uploading')}</Notice> : null}
      {errorKey ? <Notice kind="error">{t(errorKey)}</Notice> : null}

      <View style={styles.grid}>
        {assets.map((asset) => (
          <View key={asset.id} style={styles.cell}>
            <Image source={{ uri: asset.publicUrl }} style={styles.thumb} accessibilityLabel={t('profile.photos')} />
            <Text style={styles.status}>{t(STATUS_KEYS[asset.status] ?? 'photos.pending')}</Text>
            {asset.status === 'approved' ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: value.includes(asset.publicUrl) }}
                style={styles.actionTarget}
                onPress={() => toggle(asset)}
              >
                <Text style={[styles.action, value.includes(asset.publicUrl) && styles.actionOn]}>
                  {t('photos.selectForProfile')}
                </Text>
              </Pressable>
            ) : null}
            {asset.note ? <Text style={styles.note}>{asset.note}</Text> : null}
            <Pressable accessibilityRole="button" style={styles.actionTarget} onPress={() => void drop(asset)}>
              <Text style={styles.remove}>{t('photos.remove')}</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Text style={styles.hint}>{t('photos.selected', { count: value.length })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  hint: { ...typography.caption, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '31%',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.surface },
  status: { ...typography.caption, color: colors.mutedSoft },
  actionTarget: { minHeight: 44, justifyContent: 'center' },
  action: { ...typography.caption, color: colors.mintSoft },
  actionOn: { color: colors.gold, fontWeight: '700' },
  note: { ...typography.caption, color: colors.dangerSoft },
  remove: { ...typography.caption, color: colors.dangerSoft },
});
