import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

export type DebugBubbleVariant = 'info' | 'warn' | 'error' | 'success';

interface DebugBubbleProps {
  title: string;
  message?: string;
  variant?: DebugBubbleVariant;
  onClose: () => void;
  children?: React.ReactNode;
  style?: ViewStyle;
}

const VARIANT_BORDER: Record<DebugBubbleVariant, string> = {
  info: '#8ab4f8',
  warn: '#f0c674',
  error: '#ff6b6b',
  success: '#95d5b2',
};

export function DebugBubble({
  title,
  message,
  variant = 'info',
  onClose,
  children,
  style,
}: DebugBubbleProps) {
  return (
    <View style={[styles.bubble, { borderLeftColor: VARIANT_BORDER[variant] }, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityLabel="Fechar"
          style={styles.closeBtn}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: 'rgba(20, 20, 20, 0.94)',
    borderRadius: 10,
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#333',
  },
  closeText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    color: '#ddd',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
});
