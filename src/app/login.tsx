import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isFirebaseConfigured } from '@/services/firebase';
import { authErrorMessage, useAuth } from '@/state/auth';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!isFirebaseConfigured) return <SetupNeeded />;

  const submit = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else await signUp(email, password);
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Írd be az e-mail-címedet, és arra küldjük a jelszó-visszaállító levelet.');
      return;
    }
    try {
      await resetPassword(email);
      setInfo('Elküldtük a jelszó-visszaállító levelet.');
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen tabs={false}>
        <View style={{ marginTop: Spacing.six, gap: Spacing.two }}>
          <ThemedText style={{ fontSize: 40 }}>💸</ThemedText>
          <ThemedText style={{ fontSize: 32, lineHeight: 38, fontWeight: '700' }}>Költésfigyelő</ThemedText>
          <ThemedText themeColor="textSecondary">
            Töltsd be a bankszámlakivonatodat, és megmutatjuk, hova megy a pénzed, és hol spórolhatsz.
          </ThemedText>
        </View>

        <Card style={{ gap: Spacing.three }}>
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="nev@pelda.hu"
          />
          <Field
            label="Jelszó"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            placeholder={mode === 'register' ? 'Legalább 6 karakter' : undefined}
            onSubmitEditing={submit}
          />
          {error ? <ThemedText style={{ color: theme.danger }}>{error}</ThemedText> : null}
          {info ? <ThemedText style={{ color: theme.success }}>{info}</ThemedText> : null}
          <Button
            title={mode === 'login' ? 'Bejelentkezés' : 'Fiók létrehozása'}
            onPress={submit}
            loading={busy}
            disabled={!email || !password}
          />
          <Button
            variant="ghost"
            title={mode === 'login' ? 'Még nincs fiókom – regisztrálok' : 'Már van fiókom – bejelentkezem'}
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          />
          {mode === 'login' ? <Button variant="ghost" title="Elfelejtettem a jelszavam" onPress={forgot} /> : null}
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function SetupNeeded() {
  return (
    <Screen tabs={false}>
      <View style={{ marginTop: Spacing.six, gap: Spacing.two }}>
        <ThemedText style={{ fontSize: 28, lineHeight: 34, fontWeight: '700' }}>Firebase beállítása</ThemedText>
        <ThemedText themeColor="textSecondary">
          Az app nem talál Firebase-konfigurációt. Másold a projekt gyökerében lévő .env.example fájlt .env
          néven, töltsd ki a Firebase-projekted adataival, majd indítsd újra a fejlesztői szervert.
        </ThemedText>
      </View>
      <Card>
        <ThemedText type="code">cp .env.example .env{'\n'}npx expo start --clear</ThemedText>
      </Card>
      <ThemedText type="small" themeColor="textSecondary">
        A lépések részletesen a README.md „Firebase beállítása” részében vannak.
      </ThemedText>
    </Screen>
  );
}
