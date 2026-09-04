import { Platform } from 'react-native';

// The Android emulator can't reach the host machine via `localhost` — it
// needs the special 10.0.2.2 alias. iOS simulator and web share the host's
// localhost. Point this at a real IP when testing on a physical device.
export const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:4000',
  default: 'http://localhost:4000',
});
