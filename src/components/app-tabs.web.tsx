import { usePathname } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { name: 'index', href: '/', label: 'Áttekintés' },
  { name: 'transactions', href: '/transactions', label: 'Tételek' },
  { name: 'import', href: '/import', label: 'Import' },
  { name: 'insights', href: '/insights', label: 'Spórolás' },
  { name: 'budgets', href: '/budgets', label: 'Keretek' },
] as const;

/** Webes nézet: alsó, lebegő tabsáv (a natív tabok csak iOS-en és Androidon érhetők el). */
export default function AppTabs() {
  const pathname = usePathname();
  const theme = useTheme();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={styles.container}>
          <ThemedView type="backgroundElement" style={[styles.inner, { borderColor: theme.border }]}>
            {TABS.map((t) => (
              <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
                <TabButton active={t.href === '/' ? pathname === '/' : pathname.startsWith(t.href)}>{t.label}</TabButton>
              </TabTrigger>
            ))}
          </ThemedView>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused: _f, ref: _ref, active, ...props }: TabTriggerSlotProps & { active: boolean }) {
  const theme = useTheme();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}>
      <View style={[styles.buttonInner, active && { backgroundColor: theme.tint }]}>
        <ThemedText
          type={active ? 'smallBold' : 'small'}
          numberOfLines={1}
          style={{ color: active ? theme.onTint : theme.textSecondary, fontSize: 13 }}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Spacing.three,
    alignItems: 'center',
  },
  inner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
    padding: Spacing.one,
    borderRadius: Spacing.five,
    borderWidth: 1,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  button: { flex: 1 },
  buttonInner: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
});
