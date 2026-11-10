// @ts-nocheck
import StarIcon from './assets/icons/star.svg?react';
import boltUrl from './assets/icons/bolt.svg?url';
import { ReactComponent as HeartIcon } from './assets/icons/heart.svg';
import RingIcon from './assets/icons/ring.svg';

export function LocalSvgDemo() {
  return (
    <div>
      <StarIcon />
      <HeartIcon className="icon" />
      <RingIcon />
      <img src="./assets/icons/bolt.svg" alt="relative to this file" />
      <img src={boltUrl} alt="import url" />
      <img src="/logo.svg" alt="public/ folder" />
      <use href="./assets/sprite.svg#home" />
      <use href="./assets/sprite.svg#bell" />
    </div>
  );
}
