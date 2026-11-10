// @ts-nocheck
import Icon from './components/Icon';
import { SwitchIcon } from './components/SwitchIcon';
import FolderIcon from './components/FolderIcon';
import LegacyIcon from '@/legacy/LegacyIcon';

export function IconComponentDemo({ dynamicName }) {
  return (
    <div>
      <Icon name="search" />
      <Icon icon="heart" />
      <Icon name="home" />
      <SwitchIcon name="bell" />
      <SwitchIcon name="flash" />
      <FolderIcon name="home" />
      <LegacyIcon name="search" />
      <Icon name="does-not-exist" />
      <Icon name={dynamicName} />
    </div>
  );
}
