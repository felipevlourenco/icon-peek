// @ts-nocheck
// A wrapper that hands `name` straight to one @expo/vector-icons set: IconPeek follows it into the set.
import { MaterialIcons } from '@expo/vector-icons';

export const VectorIcon = ({ name, size = 24 }) => <MaterialIcons name={name} size={size} />;
