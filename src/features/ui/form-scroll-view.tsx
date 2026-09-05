import { ScrollView, type ScrollViewProps } from 'react-native';
export function FormScrollView(props: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" {...props} />;
}
