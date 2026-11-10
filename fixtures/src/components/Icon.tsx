// @ts-nocheck
// Object map: name -> imported icon. IconPeek follows each identifier to its import.
import { Search } from 'lucide-react';
import { FaHome } from 'react-icons/fa';
import HeartSvg from '../assets/icons/heart.svg?react';
import StarSvg from '../assets/icons/star.svg?react';

const icons = {
  search: Search,
  home: FaHome,
  heart: HeartSvg,
  star: StarSvg,
};

export default function Icon({ name, icon }) {
  const Component = icons[name ?? icon];
  return Component ? <Component /> : null;
}
