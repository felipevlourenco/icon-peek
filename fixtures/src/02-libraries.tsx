// @ts-nocheck
import * as Lucide from 'lucide-react';
import { Bell, House as HomeLucide, Search } from 'lucide-react';
import { FaGithub, FaHome } from 'react-icons/fa';
import { FiSearch } from 'react-icons/fi';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';
import SearchMui from '@mui/icons-material/Search';
import { AddAPhoto, AdminPanelSettingsOutlined } from '@mui/icons-material';

export function LibrariesDemo() {
  return (
    <div>
      <Search />
      <HomeLucide size={32} />
      <Bell />
      <Lucide.Star />
      <FaHome />
      <FaGithub />
      <FiSearch />
      <MagnifyingGlassIcon className="h-6 w-6" />
      <HeartIcon className="h-6 w-6" />
      <SearchMui />
      <AddAPhoto />
      <AdminPanelSettingsOutlined />
    </div>
  );
}
