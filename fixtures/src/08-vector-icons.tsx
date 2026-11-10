// @ts-nocheck
import { FontAwesome5, MaterialIcons } from '@expo/vector-icons';
import { VectorIcon } from '@/components/VectorIcon';

export function VectorDemo() {
  return (
    <div>
      <MaterialIcons name="add-a-photo" size={30} color="#fff" />
      <FontAwesome5 name="mobile-alt" size={15} />
      <FontAwesome5 name="github" />
      <FontAwesome5 name="home" solid />
      <VectorIcon name="add-a-photo" />
      <MaterialIcons name="not-an-icon" />
    </div>
  );
}
