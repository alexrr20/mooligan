import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMooliganTheme } from "@/theme/theme-provider";

export function Screen({ children }: { children: ReactNode }) {
  const { palette } = useMooliganTheme();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.fill, { backgroundColor: palette.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.page}
      >
        <SafeAreaView edges={["bottom", "left", "right"]} style={styles.content}>
          {children}
        </SafeAreaView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Copy({ children, title }: { children?: ReactNode; title?: string }) {
  const { palette } = useMooliganTheme();
  return (
    <View style={styles.copy}>
      {title && (
        <Text accessibilityRole="header" style={[styles.heading, { color: palette.text }]}>
          {title}
        </Text>
      )}
      {children !== undefined && (
        <Text selectable style={[styles.body, { color: palette.textSecondary }]}>
          {children}
        </Text>
      )}
    </View>
  );
}
export function Panel({ children }: { children: ReactNode }) {
  const { palette } = useMooliganTheme();
  return (
    <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      {children}
    </View>
  );
}
export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}
export function Button({
  label,
  onPress,
  disabled = false,
  quiet = false,
  destructive = false,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  quiet?: boolean;
  destructive?: boolean;
}) {
  const { palette } = useMooliganTheme();
  const [busy, setBusy] = useState(false);
  async function press() {
    setBusy(true);
    try {
      await onPress();
    } catch (error) {
      Alert.alert(
        "Could not complete the action",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={() => void press()}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: quiet ? palette.surface : palette.accent,
          borderColor: palette.border,
          opacity: disabled || busy ? 0.45 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={quiet ? palette.text : "#0A0A0A"} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            { color: destructive ? "#CF5446" : quiet ? palette.text : "#0A0A0A" },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { palette } = useMooliganTheme();
  return (
    <View style={styles.copy}>
      <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={label}
        placeholderTextColor={palette.textSecondary}
        autoCorrect={false}
        {...props}
        style={[
          styles.input,
          {
            color: palette.text,
            borderColor: palette.controlBorder,
            backgroundColor: palette.surface,
          },
          props.multiline && styles.multiline,
          props.style,
        ]}
      />
    </View>
  );
}
export function Choice<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  const [open, setOpen] = useState(false);
  const { palette } = useMooliganTheme();
  return (
    <View>
      <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
      <Button
        quiet
        label={options.find((option) => option.value === value)?.label ?? value}
        onPress={() => setOpen(true)}
      />
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: palette.background }]}
          >
            <Copy title={label} />
            <ScrollView>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: value === option.value }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={styles.option}
                >
                  <Text
                    style={[
                      styles.body,
                      { color: option.value === value ? palette.accentText : palette.text },
                    ]}
                  >
                    {option.value === value ? "✓ " : ""}
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Button quiet label="Cancel" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
export function confirmRemoval(title: string, message: string, remove: () => void | Promise<void>) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: () => {
        void Promise.resolve()
          .then(remove)
          .catch((error: Error) => Alert.alert("Could not delete", error.message));
      },
    },
  ]);
}
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flexGrow: 1, alignItems: "center" },
  content: { width: "100%", maxWidth: 760, padding: 20, gap: 20 },
  heading: { fontSize: 26, fontWeight: "700", letterSpacing: -0.7, lineHeight: 32 },
  body: { fontSize: 15, lineHeight: 23 },
  copy: { gap: 7 },
  panel: { padding: 18, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, gap: 14 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  button: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonLabel: { fontSize: 15, fontWeight: "600", textAlign: "center" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 5 },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000088" },
  sheet: {
    maxHeight: "80%",
    padding: 24,
    paddingBottom: 40,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 16,
  },
  option: { paddingVertical: 16, minHeight: 48 },
});
