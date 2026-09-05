import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../state/AuthContext';
import { VerificationScreen } from '../screens/VerificationScreen';
import { SearchHomeScreen } from '../screens/SearchHomeScreen';
import { ResultsScreen } from '../screens/ResultsScreen';
import { TripDetailScreen } from '../screens/TripDetailScreen';
import { PaymentScreen } from '../screens/PaymentScreen';
import { TicketScreen } from '../screens/TicketScreen';
import { colors } from '../theme/tokens';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Only the "verify" -> "home" jump is gated on session state (mirroring
// the prototype's isVerify screen). Every screen after Home already
// assumes an authenticated rider via useAuth().
export function RootNavigator() {
  const { session } = useAuth();

  const navTheme = {
    ...DarkTheme,
    colors: { ...DarkTheme.colors, background: colors.paper, card: colors.ink, text: colors.textOnDark },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Verification" component={VerificationScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={SearchHomeScreen} />
            <Stack.Screen name="Results" component={ResultsScreen} />
            <Stack.Screen name="TripDetail" component={TripDetailScreen} />
            <Stack.Screen name="Payment" component={PaymentScreen} />
            <Stack.Screen name="Ticket" component={TicketScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
