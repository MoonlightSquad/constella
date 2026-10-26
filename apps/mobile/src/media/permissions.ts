import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

export type MicPermission = 'granted' | 'denied';

/**
 * Мікрофон питимо на старті захищеної групи: системний діалог посеред затискання забирає
 * responder у кнопки запису, і перший запис зривався. Зберігати стан немає сенсу —
 * пам'яттю слугує сама ОС, а `canAskAgain` каже, чи діалог ще взагалі можна показати.
 */
export const ensureMicPermission = async (): Promise<MicPermission> => {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await requestRecordingPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
};
