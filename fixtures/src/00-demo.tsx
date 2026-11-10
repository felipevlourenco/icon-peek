// @ts-nocheck
import { Bell, Search } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { HeartIcon } from '@heroicons/react/24/solid';
import { AddAPhoto } from '@mui/icons-material';
import StarIcon from './assets/icons/star.svg?react';
import Icon from './components/Icon';

export function Toolbar() {
  return (
    <header className="toolbar">
      <Search />
      <Bell />
      <FaGithub />
      <HeartIcon className="h-6 w-6" />
      <AddAPhoto />
      <StarIcon />
      <Icon name="home" />
      <img src="/logo.svg" alt="logo" />
      <i className="bi bi-alarm-fill"></i>
    </header>
  );
}
