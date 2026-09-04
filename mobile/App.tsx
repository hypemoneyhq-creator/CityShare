import { IBMPlexMono_400Regular, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, useFonts } from '@expo-google-fonts/outfit';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from 'react-native';
import { VerificationScreen } from './src/screens/VerificationScreen';
import { colors } from './src/theme/tokens';

export default function App() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.greenOnDark} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <VerificationScreen onComplete={() => {}} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.darkSurfaceBg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.darkSurfaceBg },
});
