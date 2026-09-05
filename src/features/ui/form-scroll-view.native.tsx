import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { ScrollViewProps } from 'react-native';
export function FormScrollView(props: ScrollViewProps) {
  return <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" {...props} />;
}
