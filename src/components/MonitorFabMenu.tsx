import { Pressable, StyleSheet, Text, View } from 'react-native';

interface MonitorFabMenuProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onCollect: () => void;
  onReload: () => void;
  onHistorico: () => void;
  onProbe?: () => void;
  onColeta?: () => void;
  showProbeItem?: boolean;
  showColetaItem?: boolean;
  onLogin?: () => void;
  showLoginItem?: boolean;
}

interface MenuItemProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}

function MenuItem({ label, onPress, disabled, primary }: MenuItemProps) {
  return (
    <Pressable
      style={[styles.menuItem, primary && styles.menuItemPrimary, disabled && styles.menuItemDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.menuItemText, primary && styles.menuItemTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function MonitorFabMenu({
  menuOpen,
  onToggleMenu,
  isRunning,
  onStart,
  onStop,
  onCollect,
  onReload,
  onHistorico,
  onProbe,
  onColeta,
  showProbeItem,
  showColetaItem,
  onLogin,
  showLoginItem,
}: MonitorFabMenuProps) {
  return (
    <View style={styles.fabRoot} pointerEvents="box-none">
      <Pressable
        style={styles.fab}
        onPress={onToggleMenu}
        accessibilityLabel="Menu"
      >
        <Text style={styles.fabIcon}>{menuOpen ? '✕' : '☰'}</Text>
      </Pressable>

      {menuOpen ? (
        <View style={styles.menuPanel}>
          <MenuItem label="Iniciar" onPress={onStart} disabled={isRunning} primary />
          <MenuItem label="Parar" onPress={onStop} disabled={!isRunning} />
          <MenuItem label="Coletar agora" onPress={onCollect} />
          <MenuItem label="Recarregar" onPress={onReload} />
          <MenuItem label="Histórico" onPress={onHistorico} />
          {showColetaItem && onColeta ? (
            <MenuItem label="Testar coleta JSON" onPress={onColeta} />
          ) : null}
          {showProbeItem && onProbe ? (
            <MenuItem label="Testar probe Betano" onPress={onProbe} />
          ) : null}
          {showLoginItem && onLogin ? (
            <MenuItem label="Login Supabase" onPress={onLogin} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fabRoot: {
    position: 'absolute',
    top: 48,
    left: 12,
    zIndex: 20,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#c45c00',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
  },
  fabIcon: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  menuPanel: {
    marginTop: 8,
    backgroundColor: 'rgba(26, 26, 26, 0.97)',
    borderRadius: 10,
    paddingVertical: 4,
    minWidth: 168,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 10,
  },
  menuItem: {
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  menuItemPrimary: {
    backgroundColor: 'rgba(196, 92, 0, 0.25)',
  },
  menuItemDisabled: {
    opacity: 0.4,
  },
  menuItemText: {
    color: '#eee',
    fontSize: 13,
    fontWeight: '600',
  },
  menuItemTextPrimary: {
    color: '#ffb366',
  },
});
