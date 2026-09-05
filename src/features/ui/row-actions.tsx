import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { PickerSheet } from './picker-sheet';
import { L, R } from './theme';

/** One accessible target replaces overlapping reorder arrows in narrow rows. */
export function RowActions({ label, onMove, first, last, onStart }: {
  label: string; onMove: (direction: -1 | 1) => void; first: boolean; last: boolean; onStart?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [
    ...(onStart ? [{ key: 'start', label: 'Bu göreve odaklan' }] : []),
    ...(!first ? [{ key: 'up', label: 'Yukarı taşı' }] : []),
    ...(!last ? [{ key: 'down', label: 'Aşağı taşı' }] : []),
  ];
  if (!options.length) return null;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} işlemleri`} onPress={(event) => { event.stopPropagation(); setOpen(true); }}
      style={({ pressed }) => ({ width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: R.md, backgroundColor: pressed ? L.pressed : 'transparent' })}>
      <Feather name="more-vertical" size={20} color={L.ink2} />
    </Pressable>
    <PickerSheet visible={open} title={label} options={options} onClose={() => setOpen(false)}
      onSelect={(key) => key === 'start' ? onStart?.() : onMove(key === 'up' ? -1 : 1)} />
  </>;
}
